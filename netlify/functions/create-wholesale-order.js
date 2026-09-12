// netlify/functions/create-wholesale-order.js
// Admin-only. Places wholesale orders against wholesale_inventory (real,
// permanent sales — never touches retail `inventory`). Writes into the
// shared `orders` table tagged channel:"wholesale" so orders.html and the
// morning briefing pick it up automatically.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);

        const secret = process.env.CREATOR_ORDER_SECRET;
        if (secret && body.secret !== secret) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
        }

        const {
            buyer_name,       // company / studio name
            email,
            phone,
            address,
            landmark,
            city,
            state,
            pincode,
            payment_method,   // e.g. "bank_transfer", "upi", "cash"
            items,            // [{ id, color, qty }]
        } = body;

        if (!buyer_name || !address || !items || !items.length) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
        }

        const orderItems = [];
        const skipped = [];
        let totalPaise = 0;

        for (const item of items) {
            const { data: inv, error: invErr } = await supabase
                .from("wholesale_inventory")
                .select("product_name, price_paise, active")
                .eq("product_id", item.id)
                .eq("color", item.color || "default")
                .single();

            if (invErr || !inv || !inv.active) {
                skipped.push({ ...item, reason: invErr ? "not found" : "inactive" });
                continue;
            }

            const qty = Math.max(1, Math.min(500, parseInt(item.qty) || 1));
            totalPaise += inv.price_paise * qty;

            orderItems.push({
                product_id:   item.id,
                product_name: inv.product_name,
                color:        item.color || "Not specified",
                quantity:     qty,
                unit_paise:   inv.price_paise,
            });
        }

        if (skipped.length > 0) {
            console.error(`Wholesale order: ${skipped.length} item(s) skipped:`, JSON.stringify(skipped));
        }
        if (orderItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No valid items found in wholesale_inventory" }) };
        }

        const receipt = "ritual_wholesale_" + Date.now();
        const orderData = {
            razorpay_order_id: receipt,
            status:            "paid",
            payment_method:    payment_method || "wholesale",
            channel:           "wholesale",
            items:             orderItems,
            amount_paise:      totalPaise,
            shipping_address:  [address, landmark, city, state, pincode].filter(Boolean).join(", "),
            guest_name:        buyer_name,
            guest_email:       email || null,
            guest_phone:       phone || null,
        };

        const { data: order, error: insertErr } = await supabase
            .from("orders").insert(orderData).select("id").single();

        if (insertErr || !order) {
            console.error("Wholesale order insert error:", insertErr);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to save order — please try again." }) };
        }

        for (const item of orderItems) {
            const { error: rpcErr } = await supabase.rpc("increment_wholesale_sold", {
                p_product_id: item.product_id,
                p_color:      item.color,
            });
            if (rpcErr) console.error("Wholesale inventory increment error:", rpcErr, item.product_id, item.color);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                order_id: order.id,
                receipt,
                saved_items: orderItems.length,
                requested_items: items.length,
                skipped,
            }),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};