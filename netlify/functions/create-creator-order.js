// netlify/functions/create-creator-order.js
// Admin-only endpoint for placing free creator/collaboration gifting orders.
// Not linked from any public page — protected by CREATOR_ORDER_SECRET.
// Decrements inventory (via increment_sold RPC, product_id + color) so stock
// stays accurate, but amount_paise is always 0 — no Razorpay, no COD fee.

const { createClient } = require("@supabase/supabase-js");
const { PRODUCT_MAP, resolveProductKey } = require("./shared/product-map");

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

        // ── Auth: require matching secret ─────────────
        const secret = process.env.CREATOR_ORDER_SECRET;
        if (secret && body.secret !== secret) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
        }

        const {
            creator_name,
            creator_handle,
            email,
            phone,
            address,
            landmark,
            city,
            state,
            pincode,
            items, // [{ id, weight, color, qty }]
        } = body;

        if (!creator_name || !address || !items || !items.length) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
        }

        // ── Resolve + validate each item against inventory ───
        const orderItems = [];
        for (const item of items) {
            const key = resolveProductKey(item);
            const product = key && PRODUCT_MAP[key];
            if (!product) continue;

            const { data: inv, error: invErr } = await supabase
                .from("inventory")
                .select("active")
                .eq("product_id", product.id)
                .eq("color", item.color || "default")
                .single();
            if (invErr || !inv || !inv.active) continue;

            const qty = Math.max(1, Math.min(10, parseInt(item.qty) || 1));

            orderItems.push({
                product_id:   product.id,
                product_name: product.name,
                weight:       product.weight,
                color:        item.color || "Not specified",
                qty,
            });
        }

        if (orderItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No valid items in gift order" }) };
        }

        // ── Save one order row per line item, amount_paise: 0 ───
        const giftReceipt = "ritual_gift_" + Date.now();
        const savedIds = [];

        for (const item of orderItems) {
            const orderData = {
                product_id:        item.product_id,
                product_name:      item.product_name,
                weight:            item.weight,
                color:             item.color,
                quantity:          item.qty,
                amount_paise:      0,
                razorpay_order_id: giftReceipt,
                status:            "gifted",
                payment_method:    "creator_gift",
                shipping_address:  [address, landmark, city, state, pincode].filter(Boolean).join(", "),
                guest_name:        creator_handle ? `${creator_name} (${creator_handle})` : creator_name,
                guest_email:       email || null,
                guest_phone:       phone || null,
            };

            const { data: order, error: insertErr } = await supabase
                .from("orders").insert(orderData).select("id").single();
            if (insertErr) {
                console.error("Creator order insert error:", insertErr);
                continue;
            }
            if (order) savedIds.push(order.id);

            // ── Decrement inventory for the exact colour gifted ───
            const { error: rpcErr } = await supabase.rpc("increment_sold", {
                p_product_id: item.product_id,
                p_color:      item.color,
            });
            if (rpcErr) console.error("Creator gift inventory increment error:", rpcErr);
        }

        // ── Send gift shipping confirmation (no pricing shown) ───
        if (email && process.env.RESEND_API_KEY) {
            await sendGiftEmail({ to: email, name: creator_name, items: orderItems });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, order_ids: savedIds, receipt: giftReceipt }),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function sendGiftEmail({ to, name, items }) {
    const itemLines = items.map(i =>
        `<tr><td style="color:#a09890;padding:6px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight} · ${i.color} × ${i.qty}</td></tr>`
    ).join("");

    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "The Ritual Co. <hello@theritualco.in>",
            to,
            subject: "Your gift is on its way ✦ The Ritual Co.",
            html: `
<div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #3a3330; padding: 40px 24px;">
  <p style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #a09890; margin: 0 0 32px;">The Ritual Co.</p>
  <h1 style="font-size: 24px; font-weight: 400; margin: 0 0 8px;">A little something is on its way.</h1>
  <p style="font-size: 15px; color: #7a6f68; margin: 0 0 32px;">Hi ${name}, thank you for being part of the Ritual Co. story. We're sending you the following:</p>
  <div style="border: 1px solid #e8e2dc; border-radius: 10px; padding: 20px 24px; margin-bottom: 32px;">
    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
      ${itemLines}
    </table>
  </div>
  <p style="font-size: 13px; color: #7a6f68; line-height: 1.7; margin: 0 0 24px;">
    We'll send you a shipping notification with tracking details once your order is dispatched.
    For any questions, reply to this email or WhatsApp us.
  </p>
  <p style="font-size: 13px; color: #a09890; margin: 0;">— Gitika &amp; the Ritual Co. team</p>
  <hr style="border: none; border-top: 1px solid #e8e2dc; margin: 32px 0;">
  <p style="font-size: 11px; color: #c0b8b0; margin: 0;">
    The Ritual Co. · <a href="https://theritualco.in" style="color: #c0b8b0;">theritualco.in</a>
  </p>
</div>
`,
        }),
    });
}