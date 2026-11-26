// GA4 Measurement Protocol: server-side purchase + refund events.
// Purchases are sent from the server (not the thank-you page) so every paid
// order is counted even if the customer closes the tab after paying.
// Needs env var GA4_API_SECRET (GA4 → Admin → Data streams → Measurement
// Protocol API secrets). Without it, everything here is a silent no-op.
const MEASUREMENT_ID = "G-D366Q7R3XB";
const PROD_HOSTS = ["theritualco.in", "www.theritualco.in"];

const COLOUR = { black: "Onyx Black", cream: "Vanilla Cream", pink: "Strawberry Milk", coffee: "Oat Latte" };

function isProdHost(event) {
    const h = String((event && event.headers && (event.headers.host || event.headers.Host)) || "").toLowerCase();
    return PROD_HOSTS.includes(h);
}

// The id GA uses for the order: Razorpay payment id for prepaid, our COD receipt otherwise.
// (Matches what the browser sent before, so refunds line up with old purchases.)
function transactionId(order) {
    // Payment id when there is one (online, and COD orders that paid the advance) — matches the browser purchase on thank-you.
    return order.razorpay_payment_id || order.razorpay_order_id;
}

function items(order) {
    return (order.items || []).map((i) => ({
        item_id: i.product_id,
        item_name: String(i.product_name || "").replace(/\s*\(Pre-order[^)]*\)/i, ""),
        item_variant: COLOUR[String(i.color || "").toLowerCase()] || i.color || undefined,
        item_category: i.is_kit ? "Kit" : undefined,
        price: (i.unit_paise || 0) / 100,
        quantity: i.quantity || i.qty || 1,
    }));
}

async function send(order, evt) {
    const secret = process.env.GA4_API_SECRET;
    if (!secret || order.ga_skip) return false;
    const clientId = order.ga_client_id || ("srv." + String(order.id).replace(/-/g, "").slice(0, 10) + "." + Math.floor(new Date(order.created_at || Date.now()) / 1000));
    if (order.ga_session_id) evt.params.session_id = order.ga_session_id;
    evt.params.engagement_time_msec = 1;
    try {
        const res = await fetch(
            `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(secret)}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, events: [evt] }) }
        );
        return res.status >= 200 && res.status < 300;
    } catch (e) {
        console.error("[GA4] send failed", e.message);
        return false;
    }
}

// Sends the purchase once per order and stamps ga_purchase_sent_at.
async function trackPurchase(supabase, order) {
    if (!order || order.ga_purchase_sent_at || !order.amount_paise) return;
    const ok = await send(order, {
        name: "purchase",
        params: {
            transaction_id: transactionId(order),
            currency: "INR",
            value: order.amount_paise / 100,
            payment_type: order.payment_method === "online" ? "Online" : "COD",
            items: items(order),
        },
    });
    if (ok) await supabase.from("orders").update({ ga_purchase_sent_at: new Date().toISOString() }).eq("id", order.id);
}

// Full refund for an order that came back (RTO / returned). Once per order.
async function trackRefund(supabase, order) {
    if (!order || order.ga_refund_sent_at || !order.amount_paise) return;
    if (["creator_gift", "event_stock"].includes(order.payment_method)) return;
    const ok = await send(order, {
        name: "refund",
        params: { transaction_id: transactionId(order), currency: "INR", value: order.amount_paise / 100 },
    });
    if (ok) await supabase.from("orders").update({ ga_refund_sent_at: new Date().toISOString() }).eq("id", order.id);
}

module.exports = { isProdHost, trackPurchase, trackRefund, transactionId };
