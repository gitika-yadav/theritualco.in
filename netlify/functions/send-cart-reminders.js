// netlify/functions/send-cart-reminders.js
// Sends ONE "Still thinking it over?" email to shoppers who entered their email
// at checkout but didn't order.
//
// Triggered by cron-job.org every 30 min:
//   GET /.netlify/functions/send-cart-reminders?secret=CART_REMINDER_SECRET
//
// Rules:
//   - session last touched 2–48 hours ago, never reminded, never converted
//   - skip if that email has placed any real order since the session started
//   - skip if that email already got a reminder in the last 7 days
//   - one email per session, ever

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SITE = "https://theritualco.in";
const WAIT_HOURS = 2;
const MAX_AGE_HOURS = 48;
const COOLDOWN_DAYS = 7;
const BATCH = 25;

const SHADE = { Cream: "Vanilla Cream", Pink: "Strawberry Milk", Black: "Onyx Black", Coffee: "Oat Latte" };

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rupees = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const hoursAgo = h => new Date(Date.now() - h * 3600 * 1000).toISOString();

function firstName(name) {
    const f = String(name || "").trim().split(/\s+/)[0] || "";
    return f ? f.charAt(0).toUpperCase() + f.slice(1) : "";
}

function emailHtml(session) {
    const restore = `${SITE}/cart.html?restore=${encodeURIComponent(session.token)}` +
        "&utm_source=email&utm_medium=reminder&utm_campaign=abandoned_cart";
    const hi = firstName(session.name) ? `Hi ${esc(firstName(session.name))}, your` : "Your";

    const rows = (session.items || []).map((i, n) => {
        const meta = [SHADE[i.color] || i.color, i.weight].filter(Boolean).join(" · ");
        const qty = i.qty > 1 ? ` × ${i.qty}` : "";
        const img = i.image
            ? `<img src="${SITE}${esc(i.image)}" width="60" height="60" alt="" style="border-radius:8px;object-fit:cover;display:block">`
            : "";
        return `<tr${n ? ' style="border-top:1px solid #f0ece8;"' : ""}>
  <td style="padding:12px 0;width:72px;">${img}</td>
  <td style="padding:12px 0;">${esc(i.name)}${qty}<br><span style="color:#a09890;font-size:12px;">${esc(meta)}</span></td>
  <td style="padding:12px 0;text-align:right;white-space:nowrap;">${rupees(i.price * i.qty)}</td></tr>`;
    }).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f1ec;">
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;background:#faf9f6;">
<p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
<h1 style="font-size:26px;font-weight:400;margin:0 0 10px;">Still thinking it over?</h1>
<p style="font-size:15px;line-height:1.6;color:#7a6f68;margin:0 0 28px;">${hi} cart is saved just as you left it. Pick up where you stopped whenever you're ready.</p>
<div style="border:1px solid #e8e2dc;border-radius:10px;padding:8px 20px;margin-bottom:28px;background:#fff;">
<table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px;">
${rows}
<tr style="border-top:1px solid #e8e2dc;"><td></td><td style="padding:14px 0;font-weight:600;">Total</td><td style="padding:14px 0;text-align:right;font-weight:600;">${rupees(session.total)}</td></tr>
</table>
</div>
<a href="${restore}" style="display:block;text-align:center;background:#3a3330;color:#fff;text-decoration:none;padding:16px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">Return to your cart</a>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7a6f68;text-align:center;margin:18px 0 32px;">Free shipping &nbsp;·&nbsp; Cash on delivery &nbsp;·&nbsp; 7-day easy returns</p>
<p style="font-size:15px;line-height:1.6;color:#3a3330;margin:0 0 6px;">Questions about sizing, colour or delivery? Just reply to this email and we'll help.</p>
<p style="font-size:15px;color:#3a3330;margin:0 0 32px;">— The Ritual Co. team</p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#b0a89f;margin:0;">This is the only reminder we'll send about this cart.</p>
</div></body></html>`;
}

async function sendEmail(to, html) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: "The Ritual Co. <hello@theritualco.in>",
            reply_to: "theritualcoofficial@gmail.com",
            to,
            subject: "Still thinking it over?",
            html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
}

exports.handler = async (event) => {
    if (!["GET", "POST"].includes(event.httpMethod)) return { statusCode: 405, body: "Method not allowed" };

    const secret = process.env.CART_REMINDER_SECRET || process.env.BRIEFING_SECRET;
    if (!secret || (event.queryStringParameters || {}).secret !== secret) {
        return { statusCode: 401, body: "Unauthorised" };
    }
    const dryRun = (event.queryStringParameters || {}).dry === "1";

    try {
        const { data: due, error } = await supabase
            .from("checkout_sessions")
            .select("*")
            .is("reminded_at", null)
            .is("converted_at", null)
            .lte("updated_at", hoursAgo(WAIT_HOURS))
            .gte("updated_at", hoursAgo(MAX_AGE_HOURS))
            .order("updated_at", { ascending: false }) // newest cart per email wins
            .limit(BATCH);
        if (error) throw error;

        const report = { checked: (due || []).length, sent: [], skipped: [] };
        const seen = new Set();

        for (const s of due || []) {
            // Only the latest cart per email (older ones get caught by the 7-day rule next run).
            if (seen.has(s.email)) { report.skipped.push({ email: s.email, why: "older cart, same email" }); continue; }
            seen.add(s.email);

            // Ordered since? (any real order — not an unpaid online attempt)
            const { data: orders } = await supabase
                .from("orders").select("id")
                .ilike("guest_email", s.email)
                .neq("status", "pending")
                .gte("created_at", new Date(new Date(s.created_at).getTime() - 3600 * 1000).toISOString())
                .limit(1);
            if (orders && orders.length) { report.skipped.push({ email: s.email, why: "ordered" }); await mark(s, "converted_at", dryRun); continue; }

            // Reminded recently about another cart?
            const { data: recent } = await supabase
                .from("checkout_sessions").select("id")
                .eq("email", s.email)
                .gte("reminded_at", hoursAgo(COOLDOWN_DAYS * 24))
                .limit(1);
            if (recent && recent.length) { report.skipped.push({ email: s.email, why: "reminded recently" }); await mark(s, "reminded_at", dryRun); continue; }

            if (!dryRun) {
                await sendEmail(s.email, emailHtml(s));
                await mark(s, "reminded_at", false);
            }
            report.sent.push({ email: s.email, total: s.total });
        }

        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun, ...report }) };
    } catch (err) {
        console.error("send-cart-reminders:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function mark(session, column, dryRun) {
    if (dryRun) return;
    await supabase.from("checkout_sessions").update({ [column]: new Date().toISOString() }).eq("id", session.id);
}

// Exported for local preview/testing.
exports.emailHtml = emailHtml;
