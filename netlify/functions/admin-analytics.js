const { createClient } = require("@supabase/supabase-js");
const { google } = require("googleapis");
const crypto = require("crypto");

function verifyAdminToken(token) {
    if (!token) return false;
    const [expires, hmac] = token.split(".");
    if (!expires || !hmac) return false;
    if (Date.now() > parseInt(expires)) return false;
    const expected = crypto.createHmac("sha256", process.env.ADMIN_PASSWORD).update(expires).digest("hex");
    try { return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected)); } catch { return false; }
}

exports.handler = async (event) => {
    if (!verifyAdminToken(event.headers["x-admin-token"])) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch orders
    const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: true });

    // Fetch discount codes
    const { data: discounts } = await supabase
        .from("discount_codes")
        .select("code, used_count, type, value, discount_amount");

    // Fetch waitlist count from Google Sheet
    let waitlistCount = 0;
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
        const auth = new google.auth.JWT(
            credentials.client_email, null, credentials.private_key,
            ["https://www.googleapis.com/auth/spreadsheets"]
        );
        const sheets = google.sheets({ version: "v4", auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: "Waitlist!B:B",
        });
        waitlistCount = (res.data.values || []).filter(r => r[0] && r[0].includes("@")).length;
    } catch {}

    const paid = (orders || []).filter(o => ["paid","shipped","delivered"].includes(o.status));

    // Revenue over time (group by day)
    const revenueByDay = {};
    const ordersByDay = {};
    paid.forEach(o => {
        const day = o.created_at.slice(0, 10);
        revenueByDay[day] = (revenueByDay[day] || 0) + (o.amount_paise / 100);
        ordersByDay[day] = (ordersByDay[day] || 0) + 1;
    });

    // By colour
    const byColour = {};
    paid.forEach(o => {
        const c = o.color || "Unknown";
        byColour[c] = (byColour[c] || 0) + 1;
    });

    // By weight
    const byWeight = {};
    paid.forEach(o => {
        const w = o.weight || "Unknown";
        byWeight[w] = (byWeight[w] || 0) + 1;
    });

    // By status
    const byStatus = {};
    (orders || []).forEach(o => {
        byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    });

    // Top customers
    const customerMap = {};
    paid.forEach(o => {
        const email = o.guest_email || o.customer_email || "unknown";
        if (!customerMap[email]) customerMap[email] = { email, name: o.guest_name || o.customer_name || "—", orders: 0, revenue: 0 };
        customerMap[email].orders++;
        customerMap[email].revenue += o.amount_paise / 100;
    });
    const topCustomers = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
        statusCode: 200,
        body: JSON.stringify({
            summary: {
                total_orders: (orders || []).length,
                paid_orders: paid.length,
                total_revenue: paid.reduce((s, o) => s + o.amount_paise / 100, 0),
                avg_order_value: paid.length ? paid.reduce((s, o) => s + o.amount_paise / 100, 0) / paid.length : 0,
                waitlist_count: waitlistCount,
                pending_shipment: (orders || []).filter(o => o.status === "paid").length,
                conversion_rate: waitlistCount ? ((paid.length / waitlistCount) * 100).toFixed(1) : 0,
            },
            revenue_by_day: revenueByDay,
            orders_by_day: ordersByDay,
            by_colour: byColour,
            by_weight: byWeight,
            by_status: byStatus,
            top_customers: topCustomers,
            discounts: discounts || [],
        }),
    };
};