// netlify/functions/morning-briefing.js
// Morning briefing agent — queries Supabase orders + compliance deadlines
// Sends a daily digest email to theritualcoofficial@gmail.com via Resend
// Triggered externally by cron-job.org at 7:00 AM IST daily

const https = require("https");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const TO_EMAIL = "theritualcoofficial@gmail.com";
const FROM_EMAIL = "hello@theritualco.in";
const FROM_NAME = "The Ritual Co";

// ── COMPLIANCE DEADLINES ──────────────────────────────────────────────────────
// Now pulled live from Supabase `compliance_tasks` — same table admin/compliance.html
// reads and writes via netlify/functions/compliance.js. No more static array to
// keep in sync by hand.
async function getComplianceTasks() {
    const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/compliance_tasks`);
    url.searchParams.set("select", "task_key,name,badge,done,deadline,sort_order");
    url.searchParams.set("done", "eq.false"); // only incomplete tasks matter for the briefing
    url.searchParams.set("order", "sort_order.asc");

    const res = await request({
        hostname: new URL(process.env.SUPABASE_URL).hostname,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
        },
    });

    if (res.status !== 200) return [];
    try { return JSON.parse(res.body); } catch { return []; }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve({ status: res.statusCode, body: data }));
        });
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getSupabaseOrders() {
    const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/orders`);
    // Real orders table columns — one row per line item (see create-order.js insert).
    // Previous version selected customer_name/customer_email/total_amount/items,
    // none of which exist — Supabase returned a non-200 error on every call,
    // which this function was silently swallowing (see the res.status check below).
    url.searchParams.set("select", "id,status,created_at,guest_name,guest_email,user_id,items,amount_paise,payment_method");
    url.searchParams.set("status", "in.(paid,processing,cod_unpaid,gifted)");
    url.searchParams.set("order", "created_at.asc");

    const res = await request({
        hostname: new URL(process.env.SUPABASE_URL).hostname,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
        },
    });

    if (res.status !== 200) {
        console.error("getSupabaseOrders failed:", res.status, res.body);
        return [];
    }
    try { return JSON.parse(res.body); } catch { return []; }
}

function formatCurrency(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── EMAIL TEMPLATE ─────────────────────────────────────────────────────────────
function buildEmail(orders, complianceTasks, todayStr) {
    const urgentCompliance = complianceTasks.filter(t => t.badge === "urgent");
    // "Soon" badge tasks with a deadline set — these are the ones worth surfacing
    // as upcoming, since we no longer have a parseable date to count days from
    // (deadline is now free-text like "Sep 30 annually").
    const upcomingDeadlines = complianceTasks.filter(t => t.badge === "warn" && t.deadline);

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount_paise || 0) / 100, 0);

    const ordersHtml = orders.length === 0
        ? `<p style="color:#888;font-size:14px;margin:0">No pending orders right now.</p>`
        : orders.map(o => {
            const items = o.items || [];
            const summary = items.length === 0
                ? ""
                : items.length === 1
                    ? `${items[0].product_name || ""}${items[0].color ? " · " + items[0].color : ""}${(items[0].quantity ?? items[0].qty) ? " × " + (items[0].quantity ?? items[0].qty) : ""}`
                    : `${items[0].product_name || ""} + ${items.length - 1} more (${items.length} items)`;
            return `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;font-size:13px;color:#1a1814">${o.guest_name || (o.user_id ? "Registered customer" : "Guest")}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;font-size:12px;color:#6b6660">${summary}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;font-size:13px;color:#6b6660">${formatDate(o.created_at)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;font-size:13px;color:#1a1814;font-weight:500">${formatCurrency(Number(o.amount_paise || 0) / 100)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8">
                <span style="background:#fdf3e7;color:#8b5a2b;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500">${o.status}</span>
            </td>
        </tr>`;
        }).join("");

    const urgentHtml = urgentCompliance.length === 0
        ? `<p style="color:#888;font-size:14px;margin:0">No urgent compliance tasks.</p>`
        : urgentCompliance.map(t => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f0ede8">
            <div style="width:8px;height:8px;border-radius:50%;background:#8b2e2e;margin-top:5px;flex-shrink:0"></div>
            <span style="font-size:13px;color:#1a1814">${t.name}</span>
        </div>`).join("");

    const deadlinesHtml = upcomingDeadlines.length === 0 ? "" : `
    <div style="margin-top:28px">
        <h2 style="font-size:13px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px">Upcoming deadlines</h2>
        ${upcomingDeadlines.map(t => {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0ede8">
                <span style="font-size:13px;color:#1a1814">${t.name}</span>
                <span style="font-size:12px;color:#8b5a2b;font-weight:500">${t.deadline}</span>
            </div>`;
    }).join("")}
    </div>`;

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#faf9f6;border-radius:12px;overflow:hidden;max-width:100%">

<!-- HEADER -->
<tr><td style="background:#1a1814;padding:28px 32px">
    <p style="margin:0;font-size:10px;letter-spacing:0.15em;color:#c8b8a2;text-transform:uppercase;margin-bottom:6px">The Ritual Co · Daily Briefing</p>
    <h1 style="margin:0;font-size:22px;color:#faf9f6;font-weight:400">${todayStr}</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#a09890">Good morning, Gitika. Here's what needs your attention today.</p>
</td></tr>

<!-- STATS ROW -->
<tr><td style="padding:20px 32px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td style="background:#f2efe9;border-radius:8px;padding:14px 16px;width:48%">
            <p style="margin:0;font-size:11px;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em">Pending orders</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:500;color:#1a1814">${orders.length}</p>
        </td>
        <td style="width:4%"></td>
        <td style="background:#f2efe9;border-radius:8px;padding:14px 16px;width:48%">
            <p style="margin:0;font-size:11px;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em">Pending revenue</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:500;color:#1a1814">${formatCurrency(totalRevenue)}</p>
        </td>
    </tr>
    </table>
</td></tr>

<!-- ORDERS -->
<tr><td style="padding:28px 32px 0">
    <h2 style="font-size:13px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px">Orders to ship</h2>
    ${orders.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece8df;border-radius:8px;overflow:hidden">
    <thead>
        <tr style="background:#f2efe9">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b6660;font-weight:500">Customer</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b6660;font-weight:500">Product</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b6660;font-weight:500">Date</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b6660;font-weight:500">Amount</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b6660;font-weight:500">Status</th>
        </tr>
    </thead>
    <tbody>${ordersHtml}</tbody>
    </table>
    <p style="margin:10px 0 0;font-size:12px;color:#6b6660">
        <a href="https://theritualco.in/admin/orders.html" style="color:#1a1814;font-weight:500">Open orders dashboard →</a>
    </p>` : ordersHtml}
</td></tr>

<!-- COMPLIANCE -->
<tr><td style="padding:28px 32px 0">
    <h2 style="font-size:13px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px">Urgent compliance</h2>
    ${urgentHtml}
    <p style="margin:10px 0 0;font-size:12px;color:#6b6660">
        <a href="https://theritualco.in/admin/compliance.html" style="color:#1a1814;font-weight:500">Open compliance tracker →</a>
    </p>
</td></tr>

${deadlinesHtml ? `<tr><td style="padding:0 32px">${deadlinesHtml}</td></tr>` : ""}

<!-- TODAY'S FOCUS -->
<tr><td style="padding:28px 32px 0">
    <h2 style="font-size:13px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px">Pick one thing</h2>
    <div style="background:#f2efe9;border-radius:8px;padding:16px">
        <p style="margin:0;font-size:14px;color:#1a1814;font-weight:500">${urgentCompliance[0]?.name || (orders[0] ? `Ship order for ${orders[0].guest_name || "a customer"}` : "Post a Founder Files update on your personal account")}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#6b6660">If you do only one thing today, make it this.</p>
    </div>
</td></tr>

<!-- FOOTER -->
<tr><td style="padding:28px 32px;border-top:1px solid #ece8df;margin-top:28px">
    <p style="margin:0;font-size:11px;color:#a09890;text-align:center">The Ritual Co · IORO Movement Pvt Ltd · Sent via morning briefing agent</p>
    <p style="margin:6px 0 0;font-size:11px;color:#a09890;text-align:center">This email is sent automatically every morning at 7 AM IST.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    // Allow GET (from cron-job.org) or POST
    if (!["GET", "POST"].includes(event.httpMethod)) {
        return { statusCode: 405, body: "Method not allowed" };
    }

    // Optional secret key to prevent unauthorised triggers
    // Set BRIEFING_SECRET in Netlify env vars, pass as ?secret=xxx from cron-job.org
    const secret = process.env.BRIEFING_SECRET;
    if (secret) {
        const provided = event.queryStringParameters?.secret;
        if (provided !== secret) {
            return { statusCode: 401, body: "Unauthorised" };
        }
    }

    try {
        const [orders, complianceTasks] = await Promise.all([
            getSupabaseOrders(),
            getComplianceTasks(),
        ]);
        const todayStr = new Date().toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
            timeZone: "Asia/Kolkata",
        });

        const html = buildEmail(orders, complianceTasks, todayStr);

        // Send via Resend
        const emailPayload = JSON.stringify({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: [TO_EMAIL],
            subject: `☀️ Ritual Co briefing — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`,
            html,
        });

        const resendRes = await request({
            hostname: "api.resend.com",
            path: "/emails",
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(emailPayload),
            },
        }, emailPayload);

        if (resendRes.status !== 200 && resendRes.status !== 201) {
            console.error("Resend error:", resendRes.body);
            return { statusCode: 500, body: "Email send failed" };
        }

        console.log("Morning briefing sent successfully");
        return { statusCode: 200, body: JSON.stringify({ ok: true, orders: orders.length }) };
    } catch (err) {
        console.error("Briefing agent error:", err);
        return { statusCode: 500, body: err.message };
    }
};