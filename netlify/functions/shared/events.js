// netlify/functions/shared/events.js
// Shared helpers for the events system (events-public, event-book,
// events-admin, event-reminders).

const SITE = "https://theritualco.in";
const HOLD_MINUTES = 15; // unpaid bookings hold their spots this long
const REFUND_HOURS = 48; // full refund up to this many hours before start

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtWhen(e) {
    return `${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}${e.ends_at ? "–" + fmtTime(e.ends_at) : ""}`;
}

// Tickets already taken: confirmed + recent unpaid holds.
async function ticketsTaken(supabase, eventId) {
    const holdSince = new Date(Date.now() - HOLD_MINUTES * 60 * 1000).toISOString();
    const { data } = await supabase
        .from("event_bookings")
        .select("qty, status, created_at")
        .eq("event_id", eventId)
        .in("status", ["confirmed", "pending"]);
    return (data || []).reduce((n, b) =>
        n + (b.status === "confirmed" || b.created_at >= holdSince ? b.qty : 0), 0);
}

// What the public site is allowed to see.
function publicFields(e) {
    return {
        slug: e.slug, title: e.title, subtitle: e.subtitle,
        starts_at: e.starts_at, ends_at: e.ends_at,
        venue_name: e.venue_name, venue_address: e.venue_address, map_url: e.map_url,
        price: e.price, capacity: e.capacity, max_per_booking: e.max_per_booking,
        cover_image: e.cover_image, description: e.description,
        includes: (e.includes || "").split("\n").map(s => s.trim()).filter(Boolean),
        access: e.access, status: e.status,
    };
}

function calendarLink(e) {
    const z = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 90 * 60000).toISOString();
    const p = new URLSearchParams({
        action: "TEMPLATE",
        text: e.title + " — The Ritual Co.",
        dates: `${z(e.starts_at)}/${z(end)}`,
        location: [e.venue_name, e.venue_address].filter(Boolean).join(", "),
        details: `${SITE}/events/${e.slug}`,
    });
    return "https://calendar.google.com/calendar/render?" + p.toString();
}

function shell(inner) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f1ec;">
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;background:#faf9f6;">
<p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
${inner}
<p style="font-size:15px;color:#3a3330;margin:32px 0 0;">— The Ritual Co. team</p>
</div></body></html>`;
}

function detailsCard(e, b) {
    const row = (k, v) => `<tr><td style="color:#a09890;padding:8px 0;vertical-align:top;width:90px;">${k}</td><td style="padding:8px 0;">${v}</td></tr>`;
    const venue = [esc(e.venue_name), esc(e.venue_address)].filter(Boolean).join("<br>") +
        (e.map_url ? `<br><a href="${esc(e.map_url)}" style="color:#3a3330;">Open in Maps</a>` : "");
    return `<div style="border:1px solid #e8e2dc;border-radius:10px;padding:8px 20px;margin:0 0 24px;background:#fff;">
<table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px;">
${row("When", esc(fmtWhen(e)))}
${venue ? row("Where", venue) : ""}
${row("Spots", `${b.qty} × ${esc(b.name)}${b.qty > 1 ? " + guests" : ""}`)}
${b.amount_paise ? row("Paid", "₹" + (b.amount_paise / 100).toLocaleString("en-IN")) : ""}
</table></div>`;
}

function confirmationEmail(e, b) {
    const first = esc(String(b.name || "").split(" ")[0]);
    const includes = (e.includes || "").split("\n").map(s => s.trim()).filter(Boolean);
    const policy = b.amount_paise
        ? `Need to cancel? You'll get a full refund up to ${REFUND_HOURS} hours before the event. Just reply to this email.`
        : "Can't make it after all? Reply to let us know, so we can give your spot to someone else.";
    return shell(`
<h1 style="font-size:26px;font-weight:400;margin:0 0 10px;">You're in, ${first}.</h1>
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0 0 28px;">Your spot at <strong style="color:#3a3330;">${esc(e.title)}</strong> is confirmed. We can't wait to see you.</p>
${detailsCard(e, b)}
${includes.length ? `<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a09890;margin:0 0 8px;">Included</p>
<ul style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#3a3330;margin:0 0 24px;padding-left:18px;line-height:1.7;">${includes.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
<a href="${calendarLink(e)}" style="display:block;text-align:center;background:#3a3330;color:#fff;text-decoration:none;padding:15px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">Add to calendar</a>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7a6f68;margin:24px 0 0;">${policy}</p>`);
}

function reminderEmail(e, b) {
    const first = esc(String(b.name || "").split(" ")[0]);
    return shell(`
<h1 style="font-size:26px;font-weight:400;margin:0 0 10px;">See you tomorrow, ${first}.</h1>
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0 0 28px;">A quick reminder for <strong style="color:#3a3330;">${esc(e.title)}</strong>. Wear something comfortable and bring water; we'll take care of the rest.</p>
${detailsCard(e, b)}
<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#7a6f68;margin:0;">Running late or can't make it? Just reply to this email.</p>`);
}

function cancellationEmail(e, b, refunded) {
    const first = esc(String(b.name || "").split(" ")[0]);
    return shell(`
<h1 style="font-size:26px;font-weight:400;margin:0 0 10px;">Your booking is cancelled.</h1>
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0 0 20px;">Hi ${first}, we've cancelled your spot at <strong style="color:#3a3330;">${esc(e.title)}</strong> (${esc(fmtWhen(e))}).</p>
${refunded ? `<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0;">A refund of <strong style="color:#3a3330;">₹${(refunded / 100).toLocaleString("en-IN")}</strong> is on its way to your original payment method. It usually shows within 5–7 working days.</p>` : ""}
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:16px 0 0;">We hope to see you at the next one.</p>`);
}

async function sendEmail(to, subject, html) {
    if (!process.env.RESEND_API_KEY) return;
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: "The Ritual Co. <hello@theritualco.in>",
            reply_to: "theritualcoofficial@gmail.com",
            to, subject, html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
}

const json = (statusCode, body, extraHeaders) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extraHeaders || {}) },
    body: JSON.stringify(body),
});

module.exports = {
    SITE, HOLD_MINUTES, REFUND_HOURS, esc, fmtDate, fmtTime, fmtWhen,
    ticketsTaken, publicFields, calendarLink,
    confirmationEmail, reminderEmail, cancellationEmail, sendEmail, json,
};
