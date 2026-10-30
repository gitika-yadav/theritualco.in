// netlify/functions/delhivery-sync.js
// 1. Pulls the latest Delhivery status for every shipped Delhivery order and
//    marks it delivered automatically (no more "Mark delivered" by hand).
// 2. Four days after delivery, emails the customer once asking how they're
//    finding it, with a link straight to the review form on each product page.
//
// Triggered by cron-job.org every 3 hours:
//   GET /.netlify/functions/delhivery-sync?secret=<CART_REMINDER_SECRET>   (&dry=1 to preview)

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SITE = "https://theritualco.in";
const BASE = process.env.DELHIVERY_ENV === "staging" ? "https://staging-express.delhivery.com" : "https://track.delhivery.com";
const REVIEW_AFTER_DAYS = 4;
const REVIEW_WINDOW_DAYS = 21; // don't ask about deliveries older than this

// product_id → page + photo for the review email
const PAGES = {
    "yoga-mat-5mm":      { url: "/products/the-ritual-mat",    name: "The Ritual Mat",   img: "/images/yoga-mat-lifestyle-1.webp" },
    "ankle-weights-2lb": { url: "/products/the-ritual-cuffs",  name: "The Ritual Cuffs", img: "/images/cuffs-cream-ankles-ball.webp" },
    "pilates-ball":      { url: "/products/the-ritual-ball",   name: "The Ritual Ball",  img: "/images/pilates-ball-cream.webp" },
    "pilates-ring":      { url: "/products/the-ritual-ring",   name: "The Ritual Ring",  img: null },
    "grip-socks":        { url: "/products/the-ritual-socks",  name: "The Ritual Grip Socks", img: "/images/grip-socks-cream-1.webp" },
    "grip-socks-trio":   { url: "/products/the-ritual-socks",  name: "The Ritual Grip Socks", img: "/images/grip-socks-trio.webp" },
    "yoga-belt":         { url: "/products/the-ritual-belt",   name: "The Ritual Belt",  img: "/images/yoga-belt-cream-1.webp" },
    "yoga-block":        { url: "/products/the-ritual-block",  name: "The Ritual Block", img: null },
    "capsule-1kg":       { url: "/products/capsule-dumbbell",  name: "Capsule Dumbbells", img: null },
    "capsule-2kg":       { url: "/products/capsule-dumbbell",  name: "Capsule Dumbbells", img: null },
    "capsule-dumbbell":  { url: "/products/capsule-dumbbell",  name: "Capsule Dumbbells", img: null },
};

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString();

// Delhivery status → our handling
function classify(st) {
    const type = String(st.StatusType || "").toUpperCase();
    const text = String(st.Status || "").toLowerCase();
    if (type === "DL" && text.includes("deliver")) return "delivered";
    if (type === "DL" && text.includes("rto")) return "returned";
    if (type === "RT" || text.includes("rto")) return "returning";
    return "in_transit";
}

async function fetchStatuses(awbs) {
    const out = {};
    for (let i = 0; i < awbs.length; i += 50) {
        const chunk = awbs.slice(i, i + 50);
        const res = await fetch(`${BASE}/api/v1/packages/json/?waybill=${chunk.join(",")}`, {
            headers: { Authorization: `Token ${process.env.DELHIVERY_TOKEN}`, Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        (data.ShipmentData || []).forEach(s => {
            const sh = s.Shipment || {};
            if (sh.AWB && sh.Status) out[String(sh.AWB)] = sh.Status;
        });
    }
    return out;
}

// Unique products in the order (kits → their pieces), for the review links.
function productsIn(order) {
    const seen = new Map();
    (order.items || []).forEach(i => {
        const parts = Array.isArray(i.kit_components) && i.kit_components.length && i.product_id !== "grip-socks-trio"
            ? i.kit_components.map(c => c.product_id) : [i.product_id];
        parts.forEach(id => {
            const p = PAGES[id];
            if (p && !seen.has(p.url)) seen.set(p.url, { ...p, color: i.color });
        });
    });
    return [...seen.values()].slice(0, 4);
}

function reviewEmail(order) {
    const first = String(order.guest_name || "").trim().split(/\s+/)[0] || "";
    const prods = productsIn(order);
    const rows = prods.map(p => {
        const link = `${SITE}${p.url}?rn=${encodeURIComponent(first)}&utm_source=email&utm_medium=review_request#review-form`;
        return `<tr><td style="padding:12px 0;width:72px;">${p.img ? `<img src="${SITE}${p.img}" width="60" height="60" alt="" style="border-radius:8px;object-fit:cover;display:block">` : ""}</td>
<td style="padding:12px 0;">${esc(p.name)}</td>
<td style="padding:12px 0;text-align:right;"><a href="${link}" style="display:inline-block;border:1px solid #3a3330;color:#3a3330;text-decoration:none;padding:8px 14px;border-radius:999px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Review</a></td></tr>`;
    }).join('<tr><td colspan="3" style="border-top:1px solid #f0ece8;"></td></tr>');

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f1ec;">
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;background:#faf9f6;">
<p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
<h1 style="font-size:26px;font-weight:400;margin:0 0 10px;">How's it feeling${first ? ", " + esc(first) : ""}?</h1>
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0 0 24px;">You've had a few days with your Ritual Co. pieces. We're a small team and every review genuinely helps someone else decide. Would you share a line or two?</p>
<div style="border:1px solid #e8e2dc;border-radius:10px;padding:4px 20px;margin-bottom:24px;background:#fff;">
<table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px;">${rows}</table>
</div>
<p style="font-size:15px;line-height:1.6;color:#3a3330;margin:0 0 6px;">Something not right? Just reply to this email and we'll sort it out.</p>
<p style="font-size:15px;color:#3a3330;margin:0;">— The Ritual Co. team</p>
</div></body></html>`;
}

async function sendEmail(to, subject, html) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "The Ritual Co. <hello@theritualco.in>", reply_to: "theritualcoofficial@gmail.com", to, subject, html }),
    });
    if (!res.ok) throw new Error(await res.text());
}

exports.handler = async (event) => {
    const q = event.queryStringParameters || {};
    const secret = process.env.CART_REMINDER_SECRET || process.env.BRIEFING_SECRET;
    if (!secret || q.secret !== secret) return { statusCode: 401, body: "Unauthorised" };
    const dry = q.dry === "1";
    const report = { checked: 0, delivered: [], returning: [], reviews: [] };

    try {
        // ── 1. Delivery status ──
        if (process.env.DELHIVERY_TOKEN) {
            const { data: shipped, error } = await supabase.from("orders")
                .select("id, tracking_number, delivery_status")
                .eq("status", "shipped").eq("courier", "Delhivery").not("tracking_number", "is", null)
                .limit(200);
            if (error) throw error;
            const awbs = (shipped || []).map(o => String(o.tracking_number).trim()).filter(Boolean);
            report.checked = awbs.length;
            const statuses = awbs.length ? await fetchStatuses(awbs) : {};

            for (const o of shipped || []) {
                const st = statuses[String(o.tracking_number).trim()];
                if (!st) continue;
                const kind = classify(st);
                const label = st.Status + (st.StatusLocation ? " · " + st.StatusLocation : "");
                const upd = { delivery_status: label, delivery_checked_at: new Date().toISOString() };
                if (kind === "delivered") {
                    upd.status = "delivered";
                    upd.delivered_at = st.StatusDateTime ? new Date(st.StatusDateTime).toISOString() : new Date().toISOString();
                    report.delivered.push(o.tracking_number);
                } else if (kind === "returning" || kind === "returned") {
                    report.returning.push({ awb: o.tracking_number, status: label });
                }
                if (!dry) await supabase.from("orders").update(upd).eq("id", o.id);
            }
        }

        // ── 2. Review requests ──
        const { data: due, error: e2 } = await supabase.from("orders")
            .select("id, guest_name, guest_email, items, payment_method, status, delivered_at")
            .eq("status", "delivered").is("review_requested_at", null)
            .lte("delivered_at", daysAgo(REVIEW_AFTER_DAYS)).gte("delivered_at", daysAgo(REVIEW_WINDOW_DAYS))
            .limit(50);
        if (e2) throw e2;

        const emailed = new Set();
        for (const o of due || []) {
            const skip = !o.guest_email || o.payment_method === "creator_gift" || emailed.has(o.guest_email.toLowerCase()) || !productsIn(o).length;
            if (!dry) {
                if (!skip && process.env.RESEND_API_KEY) {
                    try { await sendEmail(o.guest_email, "How's it feeling? ✦ The Ritual Co.", reviewEmail(o)); }
                    catch (err) { console.error("[REVIEW_EMAIL]", o.id, err.message); continue; }
                }
                await supabase.from("orders").update({ review_requested_at: new Date().toISOString() }).eq("id", o.id);
            }
            if (!skip) { emailed.add(o.guest_email.toLowerCase()); report.reviews.push(o.guest_email); }
        }

        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dry, ...report }) };
    } catch (err) {
        console.error("delhivery-sync:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

exports._test = { classify, productsIn, reviewEmail };
