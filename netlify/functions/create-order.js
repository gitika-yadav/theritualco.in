const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const PRODUCT_MAP = {
    "1kg": { id: "capsule-1kg", name: "Capsule Dumbbells 1 KG", weight: "1 KG" },
    "2kg": { id: "capsule-2kg", name: "Capsule Dumbbells 2 KG", weight: "2 KG" },
};

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { cart, name, email, phone, address, user_id } = body;

        if (!cart || !cart.length || !name || !email || !phone || !address) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
        }

        // ── Calculate total from cart ─────────────
        // Always validate price server-side against inventory
        let totalPaise = 0;
        const orderItems = [];

        for (const item of cart) {
            const product = PRODUCT_MAP[item.weight?.toLowerCase()];
            if (!product) continue;

            const { data: inv, error: invErr } = await supabase
                .from("inventory")
                .select("sold, early_bird_limit, early_bird_price_paise, price_paise, active")
                .eq("product_id", product.id)
                .single();

            if (invErr || !inv || !inv.active) continue;

            const isEarlyBird = inv.sold < inv.early_bird_limit;
            const unitPaise   = isEarlyBird ? inv.early_bird_price_paise : inv.price_paise;
            const qty         = Math.max(1, Math.min(10, parseInt(item.qty) || 1)); // cap at 10

            totalPaise += unitPaise * qty;
            orderItems.push({
                product_id:   product.id,
                product_name: product.name,
                weight:       item.weight,
                color:        item.color || "Not specified",
                qty,
                unit_paise:   unitPaise,
                is_early_bird: isEarlyBird,
            });
        }

        if (totalPaise === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No valid items in cart" }) };
        }

        // ── Create Razorpay order ─────────────────
        const razorpay = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const rzOrder = await razorpay.orders.create({
            amount:   totalPaise,
            currency: "INR",
            receipt:  "ritual_" + Date.now(),
            notes:    { customer: name, items: orderItems.length },
        });

        // ── Save order to Supabase ────────────────
        // For multi-item carts, create one order record per line item
        const savedIds = [];
        for (const item of orderItems) {
            const orderData = {
                product_id:       item.product_id,
                product_name:     item.product_name,
                weight:           item.weight,
                color:            item.color,
                quantity:         item.qty,
                amount_paise:     item.unit_paise * item.qty,
                razorpay_order_id: rzOrder.id,
                shipping_address: address,
                status:           "pending",
            };
            if (user_id) {
                orderData.user_id = user_id;
            } else {
                orderData.guest_name  = name;
                orderData.guest_email = email;
                orderData.guest_phone = phone;
            }

            const { data: order } = await supabase
                .from("orders").insert(orderData).select("id").single();
            if (order) savedIds.push(order.id);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                order_id:          rzOrder.id,
                amount:            rzOrder.amount,
                currency:          rzOrder.currency,
                internal_order_ids: savedIds,
                items:             orderItems,
            }),
        };

    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};