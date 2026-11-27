// netlify/functions/meta-event.js
// Server copy of the browser's AddToCart / InitiateCheckout Pixel events, sent
// to Meta's Conversions API with the same event_id (Meta keeps one). Called by
// trackMeta() in /javascript/meta-pixel.js. Only hashed user data is accepted.

const { sendBrowserEvent, CATALOG_ID_ALIASES } = require("./shared/meta-capi");
const { isProdHost } = require("./shared/ga4");

const ALLOWED = new Set(["AddToCart", "InitiateCheckout"]);

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    if (!isProdHost(event)) return { statusCode: 204, body: "" }; // previews / local: send nothing

    let b;
    try { b = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "Bad JSON" }; }

    const name = String(b.event || "");
    const eventId = String(b.event_id || "").slice(0, 100);
    if (!ALLOWED.has(name) || !eventId) return { statusCode: 400, body: "Unsupported event" };

    const p = (b.params && typeof b.params === "object") ? b.params : {};
    const ids = Array.isArray(p.content_ids) ? p.content_ids.slice(0, 20).map(x => String(x).slice(0, 80)) : [];
    const custom = {
        currency: "INR",
        value: Math.max(0, Math.min(1e6, Number(p.value) || 0)),
        content_ids: ids.map(id => CATALOG_ID_ALIASES[id] || id),
        content_type: "product_group",
    };
    if (p.content_name) custom.content_name = String(p.content_name).slice(0, 120);
    if (p.num_items) custom.num_items = Math.max(1, Math.min(500, parseInt(p.num_items) || 1));

    const clip = v => (typeof v === "string" ? v.slice(0, 200) : undefined);
    const src = clip(b.source_url);
    await sendBrowserEvent({
        eventName: name, eventId, user: b.user, custom,
        fbp: clip(b.fbp), fbc: clip(b.fbc),
        sourceUrl: src && /^https:\/\/(www\.)?theritualco\.in\//.test(src) ? src : undefined,
        headers: event.headers,
    });
    return { statusCode: 204, body: "" };
};
