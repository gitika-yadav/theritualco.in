// netlify/functions/delhivery-ship.js
// Creates Delhivery shipments from the admin orders page (no more typing
// orders into one.delhivery.com).
//
// POST (x-admin-token required) { action, ... }
//   action "preview" { order_id }           → shipment details prefilled from the order
//   action "create"  { order_id, shipment } → books it with Delhivery, saves the AWB
//   action "label"   { waybill }            → link to the shipping label PDF
//
// Env: DELHIVERY_TOKEN (Delhivery One → Settings → API Setup)
//      DELHIVERY_PICKUP (optional, default "THE RITUAL CO B2C")
//      DELHIVERY_ENV=staging to use Delhivery's test server

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");
const { PICKUP_LOCATION, PACKAGES, FALLBACK } = require("./shared/shipping-config");

const BASE = process.env.DELHIVERY_ENV === "staging"
    ? "https://staging-express.delhivery.com"
    : "https://track.delhivery.com";

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// "flat, street, landmark, City, State, 110012" → parts
function parseAddress(full) {
    const parts = String(full || "").split(",").map(s => s.trim()).filter(Boolean);
    let pin = "", state = "", city = "";
    if (parts.length && /^\d{6}$/.test(parts[parts.length - 1])) pin = parts.pop();
    if (parts.length > 1) state = parts.pop();
    if (parts.length > 1) city = parts.pop();
    return { add: parts.join(", "), city, state, pin };
}

// Flatten kits into their pieces so weights add up correctly.
function pieces(items) {
    const out = [];
    (items || []).forEach(i => {
        const qty = Number(i.quantity ?? i.qty ?? 1) || 1;
        if (Array.isArray(i.kit_components) && i.kit_components.length) {
            i.kit_components.forEach(c => out.push({ id: c.product_id, qty: (Number(c.quantity) || 1) * qty }));
        } else {
            out.push({ id: i.product_id || i.id, qty });
        }
    });
    return out;
}

function defaultsFor(order) {
    const addr = parseAddress(order.shipping_address);
    const list = pieces(order.items);
    let weight = 0, l = 0, w = 0, h = 0, mrp = 0;
    list.forEach(p => {
        const pk = PACKAGES[p.id] || FALLBACK;
        weight += pk.weight_g * p.qty;
        mrp += pk.mrp * p.qty;
        l = Math.max(l, pk.l);
        w = Math.max(w, pk.w);
        h += pk.h * p.qty; // stacked
    });
    const isCod = order.status === "cod_unpaid" || order.payment_method === "cod";
    const amount = Math.round((order.amount_paise || 0) / 100);

    const desc = (order.items || []).map(i => {
        const qty = Number(i.quantity ?? i.qty ?? 1) || 1;
        return `${i.product_name}${i.color ? ` (${i.color})` : ""}${qty > 1 ? ` x${qty}` : ""}`;
    }).join(", ");

    return {
        order_ref: "TRC-" + String(order.id).slice(0, 8).toUpperCase(),
        name: order.guest_name || order.customer_name || "",
        phone: String(order.guest_phone || "").replace(/\D/g, "").slice(-10),
        add: addr.add,
        city: addr.city,
        state: addr.state,
        pin: addr.pin,
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? amount : 0,
        total_amount: amount || mrp,
        products_desc: desc.slice(0, 250),
        quantity: list.reduce((n, p) => n + p.qty, 0) || 1,
        weight_g: weight || FALLBACK.weight_g,
        l: l || FALLBACK.l,
        w: w || FALLBACK.w,
        h: Math.min(h || FALLBACK.h, 60),
        pickup_location: PICKUP_LOCATION,
    };
}

function validate(s) {
    const errs = [];
    if (!s.name) errs.push("name");
    if (!/^\d{10}$/.test(String(s.phone || ""))) errs.push("phone (10 digits)");
    if (!s.add || s.add.length < 10) errs.push("address");
    if (!/^\d{6}$/.test(String(s.pin || ""))) errs.push("pincode");
    if (!s.city) errs.push("city");
    if (!s.state) errs.push("state");
    if (!["COD", "Prepaid"].includes(s.payment_mode)) errs.push("payment mode");
    if (s.payment_mode === "COD" && !(Number(s.cod_amount) > 0)) errs.push("COD amount");
    if (!(Number(s.weight_g) > 0)) errs.push("weight");
    return errs;
}

async function delhivery(path, opts) {
    const res = await fetch(BASE + path, {
        ...opts,
        headers: { Authorization: `Token ${process.env.DELHIVERY_TOKEN}`, Accept: "application/json", ...(opts && opts.headers) },
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorized" });
    if (!process.env.DELHIVERY_TOKEN) return json(500, { error: "DELHIVERY_TOKEN is not set in Netlify" });

    const body = JSON.parse(event.body || "{}");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    try {
        if (body.action === "label") {
            const wbn = String(body.waybill || "").replace(/\D/g, "");
            if (!wbn) return json(400, { error: "Missing waybill" });
            const r = await delhivery(`/api/p/packing_slip?wbns=${wbn}&pdf=true`, { method: "GET" });
            const pkg = r.data && r.data.packages && r.data.packages[0];
            const link = pkg && (pkg.pdf_download_link || pkg.pdf_link);
            if (!link) return json(502, { error: "Label not ready yet — try again in a minute", detail: r.data });
            return json(200, { url: link });
        }

        const { data: order, error } = await supabase.from("orders").select("*").eq("id", body.order_id).single();
        if (error || !order) return json(404, { error: "Order not found" });

        if (body.action === "preview") {
            return json(200, { shipment: defaultsFor(order), existing_awb: order.courier === "Delhivery" ? order.tracking_number : null });
        }

        if (body.action !== "create") return json(400, { error: "Unknown action" });

        if (order.tracking_number && order.courier === "Delhivery") {
            return json(409, { error: `Already booked with Delhivery: ${order.tracking_number}`, waybill: order.tracking_number });
        }

        const s = { ...defaultsFor(order), ...(body.shipment || {}) };
        s.phone = String(s.phone || "").replace(/\D/g, "").slice(-10);
        const errs = validate(s);
        if (errs.length) return json(400, { error: "Please check: " + errs.join(", ") });

        const payload = {
            shipments: [{
                name: s.name,
                add: s.add,
                pin: String(s.pin),
                city: s.city,
                state: s.state,
                country: "India",
                phone: s.phone,
                order: s.order_ref,
                payment_mode: s.payment_mode,
                cod_amount: s.payment_mode === "COD" ? String(Math.round(s.cod_amount)) : "0",
                total_amount: String(Math.round(s.total_amount)),
                products_desc: s.products_desc,
                quantity: String(s.quantity),
                weight: String(Math.round(s.weight_g)),
                shipment_length: String(s.l),
                shipment_width: String(s.w),
                shipment_height: String(s.h),
                shipping_mode: "Surface",
                seller_name: "The Ritual Co.",
                waybill: "",
            }],
            pickup_location: { name: s.pickup_location || PICKUP_LOCATION },
        };

        const r = await delhivery("/api/cmu/create.json", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "format=json&data=" + encodeURIComponent(JSON.stringify(payload)),
        });

        const pkg = r.data && r.data.packages && r.data.packages[0];
        const waybill = pkg && pkg.waybill;
        if (!r.ok || !waybill || (pkg.status && String(pkg.status).toLowerCase() !== "success")) {
            const why = (pkg && pkg.remarks && [].concat(pkg.remarks).join("; ")) || r.data.rmk || r.data.error || `HTTP ${r.status}`;
            console.error("[DELHIVERY_CREATE]", JSON.stringify(r.data).slice(0, 2000));
            return json(502, { error: "Delhivery: " + why });
        }

        // Save the AWB straight away so it's never lost. Status/email are done
        // by update-order (same as the manual "Mark shipped" flow).
        await supabase.from("orders").update({ tracking_number: String(waybill), courier: "Delhivery" }).eq("id", order.id);

        return json(200, { waybill: String(waybill) });
    } catch (err) {
        console.error("[DELHIVERY]", err);
        return json(500, { error: err.message });
    }
};

exports._test = { parseAddress, pieces, defaultsFor, validate };
