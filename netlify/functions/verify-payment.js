const Razorpay = require("razorpay");
const crypto = require("crypto");
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
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            internal_order_id,
            customer_name,
            customer_email,
        } = JSON.parse(event.body);

        // ── Verify Razorpay signature ─────────────────────
        const expectedSig = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSig !== razorpay_signature) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, error: "Invalid signature" }),
            };
        }

        // ── Fetch the order ────────────────────────────
        // .single() is correct again: one razorpay_order_id = one order row,
        // items live inside order.items (JSONB array).
        const { data: order, error: fetchErr } = await supabase
            .from("orders")
            .select("*")
            .eq("razorpay_order_id", razorpay_order_id)
            .single();

        if (fetchErr || !order) {
            return {
                statusCode: 404,
                body: JSON.stringify({ success: false, error: "Order not found" }),
            };
        }

        // ── Mark order as paid ────────────────────────────
        const { error: updateErr } = await supabase
            .from("orders")
            .update({
                razorpay_payment_id,
                razorpay_signature,
                status: "paid",
            })
            .eq("id", order.id);

        if (updateErr) {
            console.error("Order update error:", updateErr);
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, error: "Could not update order" }),
            };
        }

        // ── Increment inventory sold count — once per line item, per colour ───
        const items = order.items || [];
        for (const item of items) {
            const { error: invErr } = await supabase.rpc("increment_sold", {
                p_product_id: item.product_id,
                p_color:      item.color,
            });
            if (invErr) console.error("Inventory increment error:", invErr, "for", item.product_id, item.color);
        }

        // ── Send confirmation email via Resend ────────────
        const emailTo = customer_email || order.guest_email;
        const emailName = customer_name || order.guest_name;

        if (emailTo && process.env.RESEND_API_KEY) {
            await sendConfirmationEmail({
                to: emailTo,
                name: emailName,
                order,
                payment_id: razorpay_payment_id,
            });
        }

        // ── Also log to Google Sheet (one row per line item, keep existing) ──
        const sheetUrl = process.env.GOOGLE_SHEET_URL;
        if (sheetUrl) {
            for (const item of items) {
                await fetch(sheetUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        name: emailName,
                        email: emailTo,
                        phone: order.guest_phone || "",
                        address: order.shipping_address,
                        color: item.color,
                        product: item.product_name,
                        weight: item.weight,
                        amount: (item.unit_paise * (item.quantity ?? item.qty ?? 1)) / 100,
                        paymentId: razorpay_payment_id,
                        orderId: razorpay_order_id,
                    }),
                }).catch((e) => console.error("Sheet log failed:", e));
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, order_id: order.id }),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: err.message }),
        };
    }
};

async function sendConfirmationEmail({ to, name, order, payment_id }) {
    const amount = (order.amount_paise / 100).toLocaleString("en-IN");
    const items = order.items || [];
    const itemRows = items.map(i =>
        `<tr><td style="color:#a09890;padding:6px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight || ""}${i.weight && i.color ? " · " : ""}${i.color || ""} × ${i.quantity ?? i.qty ?? 1}</td></tr>`
    ).join("");

    await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "The Ritual Co. <orders@theritualco.in>",
            to,
            subject: "Your order is confirmed ✦ The Ritual Co.",
            html: `
<div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #3a3330; padding: 40px 24px;">
<p style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #a09890; margin: 0 0 32px;">The Ritual Co.</p>
<h1 style="font-size: 24px; font-weight: 400; margin: 0 0 8px;">Order confirmed.</h1>
<p style="font-size: 15px; color: #7a6f68; margin: 0 0 32px;">Thank you, ${name}. Your order is reserved.</p>
<div style="border: 1px solid #e8e2dc; border-radius: 10px; padding: 20px 24px; margin-bottom: 32px;">
<table style="width: 100%; font-size: 13px; border-collapse: collapse;">
${itemRows}
<tr><td style="color:#a09890;padding-top:10px;border-top:1px solid #e8e2dc;">Amount paid</td><td style="text-align:right;font-weight:500;padding-top:10px;border-top:1px solid #e8e2dc;">₹${amount}</td></tr>
<tr><td style="color: #a09890; padding: 4px 0;">Payment ID</td><td style="text-align: right; font-size: 11px; color: #a09890;">${payment_id}</td></tr>
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