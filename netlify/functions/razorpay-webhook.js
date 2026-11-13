// netlify/functions/razorpay-webhook.js
// Razorpay → us, server to server, the moment a payment is captured. Confirms paid event bookings
// even when the guest never returns to the page after paying in their UPI app.
//
// Razorpay Dashboard → Account & Settings → Webhooks → Add:
//   URL     https://theritualco.in/.netlify/functions/razorpay-webhook
//   Secret  same value as the RAZORPAY_WEBHOOK_SECRET env var in Netlify
//   Events  payment.captured, order.paid
// Only event bookings are touched; shop orders are ignored here.

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { confirmPaid } = require("./shared/event-reconcile");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return { statusCode: 500, body: "Webhook secret not configured" };

    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    const sig = event.headers["x-razorpay-signature"] || event.headers["X-Razorpay-Signature"] || "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return { statusCode: 401, body: "Bad signature" };

    try {
        const body = JSON.parse(raw);
        const payment = body.payload && body.payload.payment && body.payload.payment.entity;
        if ((body.event === "payment.captured" || body.event === "order.paid") && payment && payment.order_id && payment.status === "captured") {
            const booking = await confirmPaid(supabase, payment.order_id, payment.id);
            if (booking) console.log("[RZP_WEBHOOK] confirmed event booking", booking.id);
        }
        return { statusCode: 200, body: "ok" };
    } catch (err) {
        console.error("razorpay-webhook:", err);
        return { statusCode: 500, body: "error" }; // Razorpay retries on non-2xx
    }
};
