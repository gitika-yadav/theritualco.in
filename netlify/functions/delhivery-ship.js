// netlify/functions/delhivery-ship.js
// Creates Delhivery shipments from the admin orders page (no more typing
// orders into one.delhivery.com).
//
// POST (x-admin-token required) { action, ... }
//   action "preview" { order_id }           → shipment details prefilled from the order
//   action "create"  { order_id, shipment } → books it with Delhivery, saves the AWB
//        shipment.boxes = [{ weight_g, l, w, h, lines:[lineIndex…] }] — 2+ boxes are booked
//        as one Delhivery multi-piece shipment (MPS): one waybill per box, all
//        linked to the first (master) waybill, picked up and delivered together.
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

const rupees = (n) => Math.round(Number(n) || 0);

// One entry per order line (a kit stays one line), with its packed weight/box
// size from shipping-config and its real selling price.
function orderLines(order) {
    return (order.items || []).map((i, idx) => {
        const qty = Number(i.quantity ?? i.qty ?? 1) || 1;
        const parts = Array.isArray(i.kit_components) && i.kit_components.length
            ? i.kit_components.map(c => ({ id: c.product_id, qty: (Number(c.quantity) || 1) }))
            : [{ id: i.product_id || i.id, qty: 1 }];
        let weight = 0, l = 0, w = 0, h = 0, mrp = 0;
        parts.forEach(p => {
            const pk = PACKAGES[p.id] || FALLBACK;
            weight += pk.weight_g * p.qty; mrp += pk.mrp * p.qty;
            l = Math.max(l, pk.l); w = Math.max(w, pk.w); h += pk.h * p.qty;
        });
        const unit = i.unit_paise != null ? Number(i.unit_paise) / 100 : (Number(i.price) || mrp);
        const name = String(i.product_name || i.product_id || "Item").replace(/\s*\(Pre-order[^)]*\)/i, "");
        return { idx, name: `${name}${i.color ? ` (${i.color})` : ""}`, qty, unit: rupees(unit),
                 weight_g: weight * qty, l, w, h: h * qty, pieces: parts.reduce((n, p) => n + p.qty, 0) * qty };
    });
}

// "The Ritual Cuffs (Cream) Rs 3499 + The Ritual Ball (Cream) Rs 999"
// Delhivery's order API has no per-product price field, so the real price of
// each item goes in the contents text.
function describe(lines) {
    return lines.map(x => `${x.name}${x.qty > 1 ? ` x${x.qty}` : ""} Rs ${x.unit * x.qty}`).join(" + ").slice(0, 250);
}

function boxFor(lines) {
    return {
        weight_g: lines.reduce((n, x) => n + x.weight_g, 0) || FALLBACK.weight_g,
        l: Math.max(0, ...lines.map(x => x.l)) || FALLBACK.l,
        w: Math.max(0, ...lines.map(x => x.w)) || FALLBACK.w,
        h: Math.min(lines.reduce((n, x) => n + x.h, 0) || FALLBACK.h, 60),
        lines: lines.map(x => x.idx),
    };
}

// Split an amount across boxes in proportion to each box's product value;
// the last box takes the rounding remainder so the parts add up exactly.
function splitAmount(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let left = rupees(total);
    return weights.map((wt, i) => {
        if (i === weights.length - 1) return left;
        const part = rupees(total * wt / sum); left -= part; return part;
    });
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

    const lines = orderLines(order);
    const desc = describe(lines);

    return {
        order_ref: "TRC-" + String(order.id).slice(0, 8).toUpperCase(),
        name: (order.is_gift && order.gift_recipient) || order.guest_name || order.customer_name || "",
        phone: String((order.is_gift && order.gift_recipient_phone) || order.guest_phone || "").replace(/\D/g, "").slice(-10),
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
        lines,
        boxes: [boxFor(lines)],
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
    (s.boxes || []).forEach((b, i) => {
        if (!(Number(b.weight_g) > 0)) errs.push(`box ${i + 1} weight`);
        if (!(Number(b.l) > 0 && Number(b.w) > 0 && Number(b.h) > 0)) errs.push(`box ${i + 1} size`);
    });
    if ((s.boxes || []).length > 5) errs.push("max 5 boxes (Delhivery limit)");
    return errs;
}

// Catch typos before Delhivery bills on them. Delhivery charges the higher of
// dead weight and volumetric weight (L×W×H / 5000), so one wrong digit in a box
// size can cost thousands (18 Nov: 320×15×150 cm was billed as 150 kg).
const MAX_SIDE_CM = 100, MAX_BOX_G = 30000;
const volG = (b) => Number(b.l) * Number(b.w) * Number(b.h) / 5;   // grams
function sanity(boxes, lines) {
    const errs = [];
    boxes.forEach((b, i) => {
        const n = `Box ${i + 1}`;
        const side = Math.max(Number(b.l), Number(b.w), Number(b.h));
        if (side > MAX_SIDE_CM) errs.push(`${n}: a side of ${side} cm is too big — check L × W × H`);
        if (Number(b.weight_g) > MAX_BOX_G) errs.push(`${n}: ${b.weight_g} g is over 30 kg — check the weight`);
        const items = lines.filter(x => (b.lines || []).map(Number).includes(x.idx));
        const expect = items.reduce((t, x) => t + x.weight_g, 0);
        if (expect && Number(b.weight_g) < expect * 0.5)
            errs.push(`${n}: ${b.weight_g} g is under half what its items weigh (~${expect} g)`);
        const v = volG(b), real = Math.max(Number(b.weight_g), expect);
        if (real && v > real * 3 && v > 2000)
            errs.push(`${n}: size bills as ${(v / 1000).toFixed(1)} kg but it weighs ~${(real / 1000).toFixed(1)} kg — check L × W × H`);
    });
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

// Bulk waybill API → ["600…", "600…"]. The response shape varies (comma string,
// array, or object), so accept all of them.
async function fetchWaybills(count) {
    const r = await delhivery(`/waybill/api/bulk/json/?count=${count}`, { method: "GET" });
    const d = r.data;
    const raw = typeof d === "string" ? d : Array.isArray(d) ? d.join(",") :
        (d && (d.raw || d.waybill || d.waybills || d.wbns)) || "";
    return String(Array.isArray(raw) ? raw.join(",") : raw).replace(/[^\d,]/g, "").split(",").filter(Boolean).slice(0, count);
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorized" });
    if (!process.env.DELHIVERY_TOKEN) return json(500, { error: "DELHIVERY_TOKEN is not set in Netlify" });

    const body = JSON.parse(event.body || "{}");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    try {
        if (body.action === "label") {
            // One waybill → { url }, several (bulk) → { urls: { awb: url } }
            const list = [].concat(body.waybills || body.waybill || [])
                .map(w => String(w).replace(/\D/g, "")).filter(Boolean).slice(0, 50);
            if (!list.length) return json(400, { error: "Missing waybill" });
            const r = await delhivery(`/api/p/packing_slip?wbns=${list.join(",")}&pdf=true`, { method: "GET" });
            const urls = {};
            ((r.data && r.data.packages) || []).forEach(pkg => {
                const link = pkg.pdf_download_link || pkg.pdf_link;
                if (link) urls[String(pkg.wbn || pkg.waybill || list[0])] = link;
            });
            const first = Object.values(urls)[0];
            if (!first) return json(502, { error: "Label not ready yet — try again in a minute", detail: r.data });
            return json(200, { url: first, urls });
        }

        const { data: order, error } = await supabase.from("orders").select("*").eq("id", body.order_id).single();
        if (error || !order) return json(404, { error: "Order not found" });

        if (body.action === "preview") {
            return json(200, { shipment: defaultsFor(order), existing_awb: order.courier === "Delhivery" ? order.tracking_number : null,
                existing_boxes: order.courier === "Delhivery" ? (order.shipment_boxes || null) : null });
        }

        if (body.action !== "create") return json(400, { error: "Unknown action" });

        if (order.tracking_number && order.courier === "Delhivery") {
            return json(409, { error: `Already booked with Delhivery: ${order.tracking_number}`, waybill: order.tracking_number });
        }

        const s = { ...defaultsFor(order), ...(body.shipment || {}) };
        s.phone = String(s.phone || "").replace(/\D/g, "").slice(-10);
        const errs = validate(s);
        if (errs.length) return json(400, { error: "Please check: " + errs.join(", ") });

        const lines = orderLines(order);
        let boxes = Array.isArray(s.boxes) && s.boxes.length ? s.boxes : [boxFor(lines)];
        // every line must be in exactly one box; anything unassigned goes in box 1
        const placed = new Set(boxes.flatMap(b => (b.lines || []).map(Number)));
        lines.forEach(x => { if (!placed.has(x.idx)) boxes[0].lines = [...(boxes[0].lines || []), x.idx]; });
        boxes = boxes.filter(b => (b.lines || []).length || boxes.length === 1);
        if (boxes.length > 5) return json(400, { error: "Delhivery allows up to 5 boxes per order" });
        const bad = sanity(boxes.map(b => ({ ...b, weight_g: b.weight_g || s.weight_g, l: b.l || s.l, w: b.w || s.w, h: b.h || s.h })), lines);
        if (bad.length && !s.confirm_unusual) return json(400, { error: bad.join(" · "), unusual: bad });

        const base = {
            name: s.name, add: s.add, pin: String(s.pin), city: s.city, state: s.state, country: "India",
            phone: s.phone, order: s.order_ref, payment_mode: s.payment_mode,
            shipping_mode: "Surface", seller_name: "The Ritual Co.",
        };
        const cod = s.payment_mode === "COD" ? rupees(s.cod_amount) : 0;
        let shipments;

        if (boxes.length === 1) {
            const box = boxes[0];
            shipments = [{
                ...base,
                cod_amount: String(cod),
                total_amount: String(rupees(s.total_amount)),
                products_desc: s.products_desc || describe(lines),
                quantity: String(s.quantity),
                weight: String(rupees(box.weight_g || s.weight_g)),
                shipment_length: String(box.l || s.l), shipment_width: String(box.w || s.w), shipment_height: String(box.h || s.h),
                waybill: "",
            }];
        } else {
            // MPS: Delhivery needs a pre-fetched waybill for every box.
            const wb = await fetchWaybills(boxes.length);
            if (wb.length < boxes.length) return json(502, { error: "Couldn't get waybill numbers from Delhivery for the boxes — try again in a minute" });
            const boxLines = boxes.map(b => lines.filter(x => (b.lines || []).map(Number).includes(x.idx)));
            const values = boxLines.map(bl => bl.reduce((n, x) => n + x.unit * x.qty, 0) || 1);
            const totals = splitAmount(rupees(s.total_amount), values);
            const cods = cod ? splitAmount(cod, values) : values.map(() => 0);
            shipments = boxes.map((box, i) => ({
                ...base,
                waybill: wb[i],
                master_id: wb[0],
                shipment_type: "MPS",
                mps_children: String(boxes.length),
                mps_amount: String(cod),
                cod_amount: String(cods[i]),
                total_amount: String(totals[i]),
                products_desc: `Box ${i + 1}/${boxes.length}: ${describe(boxLines[i])}`.slice(0, 250),
                quantity: String(boxLines[i].reduce((n, x) => n + x.pieces, 0) || 1),
                weight: String(rupees(box.weight_g)),
                shipment_length: String(box.l), shipment_width: String(box.w), shipment_height: String(box.h),
            }));
        }

        const payload = { shipments, pickup_location: { name: s.pickup_location || PICKUP_LOCATION } };
        const r = await delhivery("/api/cmu/create.json", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "format=json&data=" + encodeURIComponent(JSON.stringify(payload)),
        });

        const pkgs = (r.data && r.data.packages) || [];
        const okPkgs = pkgs.filter(p => p.waybill && (!p.status || String(p.status).toLowerCase() === "success"));
        if (!r.ok || okPkgs.length !== shipments.length) {
            // Never leave half an order booked: cancel any box that did go through.
            for (const p of okPkgs) {
                await delhivery("/api/p/edit", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ waybill: String(p.waybill), cancellation: "true" }) }).catch(() => {});
            }
            const bad = pkgs.find(p => !okPkgs.includes(p));
            const why = (bad && bad.remarks && [].concat(bad.remarks).join("; ")) || r.data.rmk || r.data.error || `HTTP ${r.status}`;
            console.error("[DELHIVERY_CREATE]", JSON.stringify(r.data).slice(0, 2000));
            return json(502, { error: "Delhivery: " + why + (okPkgs.length ? " (the boxes that did go through were cancelled)" : "") });
        }
        const waybills = shipments.map(sh => sh.waybill).filter(Boolean);
        const waybill = String(shipments.length > 1 ? shipments[0].master_id : okPkgs[0].waybill);
        const boxWaybills = shipments.length > 1 ? waybills.map(String) : [waybill];

        // Save the AWB straight away so it's never lost. Status/email are done
        // by update-order (same as the manual "Mark shipped" flow).
        await supabase.from("orders").update({ tracking_number: waybill, courier: "Delhivery",
            shipment_boxes: boxWaybills.length > 1 ? boxWaybills : null }).eq("id", order.id);

        return json(200, { waybill, box_waybills: boxWaybills });
    } catch (err) {
        console.error("[DELHIVERY]", err);
        return json(500, { error: err.message });
    }
};

exports._test = { parseAddress, pieces, defaultsFor, validate, orderLines, describe, boxFor, splitAmount };
