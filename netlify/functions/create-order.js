const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY  // service key — never expose to frontend
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
        const { weight, color, name, email, phone, address, user_id } = body;

        // ── Validate inputs ───────────────────────────────
        if (!weight || !color || !name || !email || !phone || !address) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" }),
            };
        }

        const product = PRODUCT_MAP[weight.toLowerCase()];
        if (!product) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid weight" }),
            };
        }

        // ── Check inventory ───────────────────────────────
        const { data: inv, error: invErr } = await supabase
            .from("inventory")
            .select("sold, early_bird_limit, early_bird_price_paise, price_paise, active")
            .eq("product_id", product.id)
            .single();

        if (invErr || !inv) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Could not fetch inventory" }),
            };
        }

        if (!inv.active) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "This product is currently unavailable" }),
            };
        }

        // Determine price — early bird if under limit
        const isEarlyBird = inv.sold < inv.early_bird_limit;
        const amountPaise = isEarlyBird ? inv.early_bird_price_paise : inv.price_paise;

        // ── Create Razorpay order ─────────────────────────
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const rzOrder = await razorpay.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: "ritual_" + Date.now(),
            notes: { product_id: product.id, weight, color, customer: name },
        });

        // ── Create pending order in Supabase ─────────────
        const orderData = {
            product_id: product.id,
            product_name: product.name,
            weight,
            color,
            quantity: 1,
            amount_paise: amountPaise,
            razorpay_order_id: rzOrder.id,
            shipping_address: address,
            status: "pending",
        };

        if (user_id) {
            orderData.user_id = user_id;
        } else {
            orderData.guest_name = name;
            orderData.guest_email = email;
            orderData.guest_phone = phone;
        }

        const { data: order, error: orderErr } = await supabase
            .from("orders")
            .insert(orderData)
            .select()
            .single();

        if (orderErr) {
            console.error("Order insert error:", orderErr);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Could not create order" }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                order_id: rzOrder.id,
                amount: rzOrder.amount,
                currency: rzOrder.currency,
                internal_order_id: order.id,
                is_early_bird: isEarlyBird,
                slots_remaining: Math.max(0, inv.early_bird_limit - inv.sold),
            }),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};