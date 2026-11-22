// netlify/functions/shared/meta-capi.js
// Meta Conversions API: sends Purchase straight from our server, so Meta sees
// every order even when the browser Pixel is blocked (ad blockers, iOS, closed
// tabs). Uses the SAME event_id as the browser Pixel (thank-you.html), so Meta
// counts each order once.
//
// Env: META_CAPI_TOKEN      (Events Manager → your Pixel → Settings → Conversions API → Generate access token)
//      META_PIXEL_ID        (optional, defaults to our Pixel)
//      META_TEST_EVENT_CODE (optional: shows events under "Test events" while testing)

const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID || "1372190218138137";
const API = "https://graph.facebook.com/v21.0";

// Same id mapping as javascript/meta-pixel.js so catalog ids match.
const CATALOG_ID_ALIASES = {
    "ankle-weights": "ankle-weights-2lb",
    "yoga-mat": "yoga-mat-5mm",
    "capsule-dumbbell-1kg": "capsule-dumbbell",
    "capsule-dumbbell-2kg": "capsule-dumbbell",
    "capsule-1kg": "capsule-dumbbell",
    "capsule-2kg": "capsule-dumbbell",
};

const sha = v => crypto.createHash("sha256").update(v).digest("hex");
const norm = v => String(v == null ? "" : v).trim().toLowerCase();

function hashed(v) { const n = norm(v); return n ? [sha(n)] : undefined; }

function phoneHash(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (d.length === 10) d = "91" + d;          // India
    return d ? [sha(d)] : undefined;
}

// "flat, street, City, State, 110012" → { city, state, zip }
function addressParts(addr) {
    const parts = String(addr || "").split(",").map(s => s.trim()).filter(Boolean);
    const zip = parts.length && /^\d{6}$/.test(parts[parts.length - 1]) ? parts.pop() : "";
    const state = parts.length > 1 ? parts.pop() : "";
    const city = parts.length > 1 ? parts.pop() : "";
    return { city, state, zip };
}

function clientInfo(headers) {
    const h = headers || {};
    const ip = h["x-nf-client-connection-ip"] || (h["x-forwarded-for"] || "").split(",")[0].trim() || undefined;
    return { ip, ua: h["user-agent"] || undefined };
}

/**
 * sendPurchase({ eventId, value, items, email, phone, name, address, city, state, zip,
 *                fbp, fbc, sourceUrl, headers, externalId })
 * Never throws; tracking must never break an order.
 */
async function sendPurchase(o) {
    if (!process.env.META_CAPI_TOKEN || !o || !o.eventId) return { skipped: true };
    try {
        const parts = (o.city || o.state || o.zip) ? { city: o.city, state: o.state, zip: o.zip } : addressParts(o.address);
        const [fn, ...rest] = String(o.name || "").trim().split(/\s+/);
        const { ip, ua } = clientInfo(o.headers);

        const contents = (o.items || []).map(i => ({
            id: CATALOG_ID_ALIASES[i.product_id || i.id] || i.product_id || i.id,
            quantity: Number(i.quantity ?? i.qty ?? 1) || 1,
            item_price: (Number(i.unit_paise) || 0) / 100 || Number(i.price) || undefined,
        })).filter(c => c.id);

        const event = {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: String(o.eventId),
            action_source: "website",
            event_source_url: o.sourceUrl || "https://theritualco.in/checkout",
            user_data: {
                em: hashed(o.email),
                ph: phoneHash(o.phone),
                fn: hashed(fn),
                ln: hashed(rest.join(" ")),
                ct: hashed(String(parts.city || "").replace(/\s+/g, "")),
                st: hashed(String(parts.state || "").replace(/\s+/g, "")),
                zp: hashed(parts.zip),
                country: [sha("in")],
                external_id: o.externalId ? hashed(o.externalId) : undefined,
                client_ip_address: ip,
                client_user_agent: ua,
                fbp: o.fbp || undefined,
                fbc: o.fbc || undefined,
            },
            custom_data: {
                currency: "INR",
                value: Number(o.value) || 0,
                content_type: "product_group",
                content_ids: [...new Set(contents.map(c => c.id))],
                contents,
                num_items: contents.reduce((n, c) => n + c.quantity, 0),
                order_id: String(o.eventId),
            },
        };

        const body = { data: [event] };
        if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${API}/${PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) console.error("[META_CAPI]", res.status, JSON.stringify(data).slice(0, 500));
        return { ok: res.ok, data };
    } catch (err) {
        console.error("[META_CAPI]", err.message);
        return { ok: false };
    }
}

module.exports = { sendPurchase, _test: { addressParts, phoneHash, hashed } };
