// netlify/functions/admin-monthly.js
// Month-on-month money for admin/analytics.html, across every channel.
// GET (x-admin-token) → { months: [{ month: "2026-06", channels: {website,b2b,amazon,direct},
//                                     booked, received, to_come, returned, orders, aov }] }
//
// booked   = sales that stand (gifts, event stock, returns, unpaid checkouts left out)
// received = money actually in: amount_paid_paise when set (part-paid B2B),
//            COD only once delivered, everything else paid at order time
// to_come  = booked − received
// returned = RTO / returned order value (shown apart so booked + returned
//            equals the Total Income sheet's month totals)

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

const CHANNEL = { retail: "website", wholesale: "b2b", amazon: "amazon", direct: "direct" };
const SKIP_STATUS = ["pending", "failed", "cancelled"];
const RETURNED = ["rto", "returned"];

const istMonth = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
function nextMonth(ym) { let [y, m] = ym.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; }

exports.handler = async (event) => {
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorized" });
    try {
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data, error } = await sb.from("orders")
            .select("status, payment_method, channel, amount_paise, amount_paid_paise, created_at")
            .order("created_at", { ascending: true });
        if (error) throw error;

        const orders = (data || []).filter(o => !SKIP_STATUS.includes(o.status)
            && o.payment_method !== "creator_gift" && o.payment_method !== "event_stock"
            && (o.amount_paise || 0) > 0 && CHANNEL[o.channel || "retail"]);

        const months = {};
        const blank = () => ({ channels: { website: 0, b2b: 0, amazon: 0, direct: 0 }, booked: 0, received: 0, returned: 0, orders: 0 });
        const thisMonth = istMonth(new Date().toISOString());
        if (orders.length) for (let m = istMonth(orders[0].created_at); m <= thisMonth; m = nextMonth(m)) months[m] = blank();

        for (const o of orders) {
            const mo = months[istMonth(o.created_at)] || (months[istMonth(o.created_at)] = blank());
            const amt = (o.amount_paise || 0) / 100;
            if (RETURNED.includes(o.status)) { mo.returned += amt; continue; }
            let paid;
            if (o.payment_method === "cod" && o.status === "delivered") paid = amt; // advance + cash collected
            else if (o.amount_paid_paise != null) paid = Math.min(o.amount_paid_paise / 100, amt);
            else if (o.status === "cod_unpaid" || (o.payment_method === "cod" && o.status !== "delivered")) paid = 0;
            else paid = amt;
            mo.channels[CHANNEL[o.channel || "retail"]] += amt;
            mo.booked += amt; mo.received += paid; mo.orders++;
        }

        const r2 = n => Math.round(n * 100) / 100;
        return json(200, {
            months: Object.keys(months).sort().map(month => {
                const v = months[month];
                return {
                    month,
                    channels: Object.fromEntries(Object.entries(v.channels).map(([k, n]) => [k, r2(n)])),
                    booked: r2(v.booked), received: r2(v.received), to_come: r2(v.booked - v.received),
                    returned: r2(v.returned), orders: v.orders, aov: v.orders ? Math.round(v.booked / v.orders) : 0,
                };
            }),
        });
    } catch (e) {
        console.error("admin-monthly:", e);
        return json(500, { error: e.message });
    }
};
