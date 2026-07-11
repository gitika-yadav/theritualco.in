const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const PRODUCT_MAP = {
    "capsule-1kg": { id: "capsule-1kg", name: "Capsule Dumbbells", weight: "1 KG" },
    "capsule-2kg": { id: "capsule-2kg", name: "Capsule Dumbbells", weight: "2 KG" },
    "yoga-belt":   { id: "yoga-belt",   name: "Yoga Belt", weight: "96in" },
    "yoga-block":  { id: "yoga-block",  name: "Yoga Block", weight: "9x6x3in"},
};

function resolveProductKey(item) {
    if (item.id === "capsule-dumbbell") {
        const w = (item.weight || "").toLowerCase();
        if (w === "1kg") return "capsule-1kg";
        if (w === "2kg") return "capsule-2kg";
        return null;
    }
    return item.id;
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { cart, name, email, phone, address, landmark, pincode, city, state, user_id, payment_method } = body;
        const isCod = payment_method === "cod";

        if (!cart || !cart.length || !name || !email || !phone || !address) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
        }

        // ── Calculate total from cart ─────────────
        // Always validate price server-side against inventory
        let totalPaise = 0;
        const orderItems = [];

        for (const item of cart) {
            const key = resolveProductKey(item);
            const product = key && PRODUCT_MAP[key];
            if (!product) continue;

                const { data: inv, error: invErr } = await supabase
                    .from("inventory")
                    .select("sold, early_bird_limit, early_bird_price_paise, price_paise, active")
                    .eq("product_id", product.id)
                    .eq("color", item.color || "default")
                    .single();
                if (invErr || !inv || !inv.active) continue;

                const isEarlyBird = inv.sold < inv.early_bird_limit;
                const unitPaise   = isEarlyBird ? inv.early_bird_price_paise : inv.price_paise;
                const qty         = Math.max(1, Math.min(10, parseInt(item.qty) || 1));

                totalPaise += unitPaise * qty;
                orderItems.push({
                    product_id:    product.id,
                    product_name:  product.name,
                    weight:        product.weight,
                    color:         item.color || "Not specified",
                    qty,
                    unit_paise:    unitPaise,
                    is_early_bird: isEarlyBird,
                });
            }

        if (totalPaise === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No valid items in cart" }) };
        }


        // ── Apply discount server-side (never trust client) ──
        let discountPaise = 0;
        if (body.discount_code) {
            const { data: dc } = await supabase
                .from("discount_codes")
                .select("*")
                .eq("code", body.discount_code.toUpperCase().trim())
                .single();

            const cartRupees = totalPaise / 100; // note: includes COD fee — see caveat below
            const valid = dc && dc.active
                && (!dc.expires_at || new Date(dc.expires_at) >= new Date())
                && (!dc.usage_limit || dc.used_count < dc.usage_limit)
                && (!dc.min_order_amount || cartRupees >= dc.min_order_amount);

            if (valid) {
                if (dc.type === "percentage") {
                    discountPaise = Math.round((totalPaise * dc.value) / 100);
                    if (dc.max_discount) discountPaise = Math.min(discountPaise, dc.max_discount * 100);
                } else if (dc.type === "fixed") {
                    discountPaise = Math.min(dc.value * 100, totalPaise);
                }
                // free_shipping: nothing to subtract (shipping already free)
            }
        }
        totalPaise = Math.max(0, totalPaise - discountPaise);

        const COD_FEE_PAISE = 20000; // ₹200
        if (isCod) totalPaise += COD_FEE_PAISE;

        let rzOrder = null;
        if (!isCod) {
            const razorpay = new Razorpay({
                key_id:     process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
            });
            rzOrder = await razorpay.orders.create({
                amount:   totalPaise,
                currency: "INR",
                receipt:  "ritual_" + Date.now(),
                notes:    { customer: name, items: orderItems.length },
            });
        }
        const codReceipt = "ritual_cod_" + Date.now();

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
                razorpay_order_id: isCod ? codReceipt : rzOrder.id,
                status:           isCod ? "cod_unpaid" : "pending",
                payment_method:   isCod ? "cod" : "online",
                shipping_address: [address, landmark, city, state, pincode].filter(Boolean).join(", "),
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

        if (isCod) {
            for (const item of orderItems) {
                const { error: invErr } = await supabase.rpc("increment_sold", {
                    p_product_id: item.product_id,
                });
                if (invErr) console.error("COD inventory increment error:", invErr);
            }
        }

        if (isCod && process.env.RESEND_API_KEY) {
            const amount    = (totalPaise / 100).toLocaleString("en-IN");
            const orderTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            const itemLines = orderItems.map(i =>
                `<tr><td style="color:#a09890;padding:6px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight} · ${i.color} × ${i.qty}</td></tr>`
            ).join("");

            // Customer confirmation
            sendEmail({
                to: email,
                subject: "Your order is confirmed ✦ The Ritual Co.",
                html: `
                <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;">
                  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
                  <h1 style="font-size:24px;font-weight:400;margin:0 0 8px;">Order confirmed.</h1>
                  <p style="font-size:15px;color:#7a6f68;margin:0 0 32px;">Thank you, ${name}. Your capsule dumbbells are reserved.</p>
                  <div style="border:1px solid #e8e2dc;border-radius:10px;padding:20px 24px;margin-bottom:32px;">
                    <table style="width:100%;font-size:13px;border-collapse:collapse;">
                      ${itemLines}
                      <tr><td style="color:#a09890;padding:6px 0;">Payment</td><td style="text-align:right;">Cash on Delivery</td></tr>
                      <tr><td style="color:#a09890;padding:6px 0;">Amount due on delivery</td><td style="text-align:right;">₹${amount}</td></tr>
                      <tr><td style="color:#a09890;padding:6px 0;">Ships</td><td style="text-align:right;">June 2026</td></tr>
                    </table>
                  </div>
                  <p style="font-size:13px;color:#7a6f68;line-height:1.7;margin:0 0 24px;">
                    This is a Cash on Delivery order — please keep ₹${amount} ready at delivery.
                    We'll send tracking once dispatched. Reply here or WhatsApp us with any questions.
                  </p>
                  <p style="font-size:13px;color:#a09890;margin:0;">— Gitika & the Ritual Co. team</p>
                  <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0;">
                  <p style="font-size:11px;color:#c0b8b0;margin:0;">The Ritual Co. · <a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a></p>
                </div>`,
                            }).catch((e) => console.error("[COD_EMAIL_CUSTOMER_ERROR]", e.message));

                            // Owner notification
                            sendEmail({
                                to: "theritualcoofficial@gmail.com",
                                subject: `🛒 New COD order — ${name} — ₹${amount}`,
                                html: `
                <h2 style="font-family:sans-serif">New COD Order</h2>
                <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Name</td><td><strong>${name}</strong></td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Email</td><td>${email}</td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Phone</td><td>${phone}</td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Address</td><td>${address}</td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Items</td><td>${orderItems.map(i => `${i.product_name} ${i.weight} ${i.color} ×${i.qty}`).join("<br>")}</td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Payment</td><td><strong>COD</strong></td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Amount due</td><td><strong>₹${amount}</strong></td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Receipt</td><td style="font-size:12px;color:#555">${codReceipt}</td></tr>
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Time</td><td>${orderTime} IST</td></tr>
                </table>`,
                            }).catch((e) => console.error("[COD_EMAIL_OWNER_ERROR]", e.message));
        }

        if (isCod && process.env.GOOGLE_SHEET_URL) {
            const first = orderItems[0] || {};
            await fetch(process.env.GOOGLE_SHEET_URL, {
                method: "POST",
                body: JSON.stringify({
                    name, email, phone, address,
                    color: first.color || "",
                    product: first.product_name || "Capsule Dumbbells",
                    weight: first.weight || "",
                    amount: totalPaise / 100,
                    paymentId: "COD",
                    orderId: codReceipt,
                }),
            }).catch((e) => console.error("COD sheet log failed:", e));
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                order_id:          isCod ? codReceipt : rzOrder.id,
                amount:            totalPaise,
                currency:          "INR",
                internal_order_ids: savedIds,
                items:             orderItems,
                payment_method:    isCod ? "cod" : "online",
            }),
        };

    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function sendEmail({ to, subject, html }) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "The Ritual Co. <hello@theritualco.in>",
            to, subject, html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}