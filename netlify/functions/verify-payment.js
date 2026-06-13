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

        // ── Fetch the pending order ───────────────────────
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

        // ── Increment inventory sold count ────────────────
        const { error: invErr } = await supabase.rpc("increment_sold", {
            p_product_id: order.product_id,
        });
        if (invErr) console.error("Inventory increment error:", invErr);

        const emailTo   = customer_email || order.guest_email;
        const emailName = customer_name  || order.guest_name;
        const amount    = (order.amount_paise / 100).toLocaleString("en-IN");
        const orderTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        if (process.env.RESEND_API_KEY) {
            // ── Customer confirmation (your existing email) ──
            sendEmail({
                to: emailTo,
                subject: "Your order is confirmed ✦ The Ritual Co.",
                html: `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
  <h1 style="font-size:24px;font-weight:400;margin:0 0 8px;">Order confirmed.</h1>
  <p style="font-size:15px;color:#7a6f68;margin:0 0 32px;">Thank you, ${emailName}. Your capsule dumbbells are reserved.</p>
  <div style="border:1px solid #e8e2dc;border-radius:10px;padding:20px 24px;margin-bottom:32px;">
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="color:#a09890;padding:6px 0;">Product</td><td style="text-align:right;">${order.product_name}</td></tr>
      <tr><td style="color:#a09890;padding:6px 0;">Weight</td><td style="text-align:right;">${order.weight}</td></tr>
      <tr><td style="color:#a09890;padding:6px 0;">Colour</td><td style="text-align:right;">${order.color}</td></tr>
      <tr><td style="color:#a09890;padding:6px 0;">Amount paid</td><td style="text-align:right;">₹${amount}</td></tr>
      <tr><td style="color:#a09890;padding:6px 0;">Payment ID</td><td style="text-align:right;font-size:11px;color:#a09890;">${razorpay_payment_id}</td></tr>
      <tr><td style="color:#a09890;padding:6px 0;">Ships</td><td style="text-align:right;">June 2026</td></tr>
    </table>
  </div>
  <p style="font-size:13px;color:#7a6f68;line-height:1.7;margin:0 0 24px;">
    We'll send you a shipping notification with tracking details once your order is dispatched.
    For any questions, reply to this email or WhatsApp us.
  </p>
  <p style="font-size:13px;color:#a09890;margin:0;">— Gitika & the Ritual Co. team</p>
  <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0;">
  <p style="font-size:11px;color:#c0b8b0;margin:0;">
    The Ritual Co. · <a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a>
  </p>
</div>`,
            }).catch((e) => console.error("[EMAIL_CUSTOMER_ERROR]", e.message));

            // ── Owner notification (NEW) ──────────────────────
            sendEmail({
                to: "theritualcoofficial@gmail.com", // ← your email
                subject: `🛒 New order — ${emailName} — ₹${amount}`,
                html: `
<h2 style="font-family:sans-serif">New Order Received</h2>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
  <tr><td style="padding:6px 20px 6px 0;color:#888">Name</td><td><strong>${emailName}</strong></td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Email</td><td>${emailTo}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Phone</td><td>${order.guest_phone || "—"}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Address</td><td>${order.shipping_address || "—"}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Product</td><td>${order.product_name}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Weight</td><td>${order.weight}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Colour</td><td>${order.color}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Amount</td><td><strong>₹${amount}</strong></td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Payment ID</td><td style="font-size:12px;color:#555">${razorpay_payment_id}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Razorpay Order</td><td style="font-size:12px;color:#555">${razorpay_order_id}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Time</td><td>${orderTime} IST</td></tr>
</table>`,
            }).catch((e) => console.error("[EMAIL_OWNER_ERROR]", e.message));
        }

        // ── Log to Google Sheet ───────────────────────────
        const sheetUrl = process.env.GOOGLE_SHEET_URL;
        if (sheetUrl) {
            await fetch(sheetUrl, {
                method: "POST",
                body: JSON.stringify({
                    name: emailName,
                    email: emailTo,
                    phone: order.guest_phone || "",
                    address: order.shipping_address,
                    color: order.color,
                    product: order.product_name,
                    weight: order.weight,
                    amount: order.amount_paise / 100,
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                }),
            }).catch((e) => console.error("Sheet log failed:", e));
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

async function sendEmail({ to, subject, html }) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "The Ritual Co. <hello@theritualco.in>",
            to,
            subject,
            html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}