// GET /.netlify/functions/gift-public?t=<gift_token>
// Public data for the gift "digital unwrap" page. Returns ONLY what the
// recipient should see: first names, the message, what's inside (no prices)
// and a delivery stage. Never returns address, phone, email or amounts.
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const COLOUR = { black: "Onyx Black", cream: "Vanilla Cream", pink: "Strawberry Milk", coffee: "Oat Latte" };
const first = (s) => String(s || "").trim().split(/\s+/)[0] || "";

exports.handler = async (event) => {
    const t = String((event.queryStringParameters || {}).t || "");
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(t)) return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };

    const { data: o, error } = await supabase
        .from("orders")
        .select("is_gift, gift_recipient, gift_message, gift_token, status, delivery_status, items, guest_name, user_id")
        .eq("gift_token", t)
        .maybeSingle();
    if (error || !o || !o.is_gift) return { statusCode: 404, body: JSON.stringify({ error: "not_found" }) };

    let sender = first(o.guest_name);
    if (!sender && o.user_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", o.user_id).maybeSingle();
        sender = first(p && p.full_name);
    }

    const stage =
        o.status === "delivered" || /delivered/i.test(o.delivery_status || "") ? "delivered" :
        o.status === "shipped" ? "shipped" :
        ["cancelled", "refunded", "rto", "returned"].includes(o.status) ? "unavailable" : "preparing";

    const items = (o.items || []).map((i) => ({
        name: String(i.product_name || "").replace(/\s*\(Pre-order[^)]*\)/i, "").trim(),
        colour: COLOUR[String(i.color || "").toLowerCase()] || i.color || "",
        qty: i.quantity || i.qty || 1,
    }));

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        body: JSON.stringify({
            to: first(o.gift_recipient),
            from: sender,
            message: o.gift_message || "",
            stage,
            items,
        }),
    };
};
