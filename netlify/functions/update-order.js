const { createClient } = require("@supabase/supabase-js");

async function sendEmail({ to, subject, html }) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "The Ritual Co <hello@theritualco.in>",
            reply_to: "theritualcoofficial@gmail.com",
            to, subject, html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    const crypto = require("crypto");
    function verifyAdminToken(token) {
        if (!token) return false;
        const [expires, hmac] = token.split(".");
        if (!expires || !hmac) return false;
        if (Date.now() > parseInt(expires)) return false;
        const expected = crypto.createHmac("sha256", process.env.ADMIN_PASSWORD).update(expires).digest("hex");
        try { return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected)); } catch { return false; }
    }

    if (!verifyAdminToken(event.headers["x-admin-token"])) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const { order_id, status, tracking_number, courier } = JSON.parse(event.body);
    if (!order_id || !status) return { statusCode: 400, body: "Missing order_id or status" };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch order first
    const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .single();

    if (fetchErr || !order) return { statusCode: 404, body: "Order not found" };

    // Update order
    const updates = { status };
    if (tracking_number) updates.tracking_number = tracking_number;
    if (courier) updates.courier = courier;
    if (status === "shipped") updates.shipped_at = new Date().toISOString();

    const { error: updateErr } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order_id);

    if (updateErr) return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };

    // Send shipping email if marking as shipped
    if (status === "shipped" && (order.guest_email || order.customer_email)) {
        const email = order.guest_email || order.customer_email;
        const name = (order.guest_name || order.customer_name || "there").split(" ")[0];
        const amount = (order.amount_paise / 100).toLocaleString("en-IN");

        const trackingHtml = tracking_number ? `
      <div style="background:#f9f6f2;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a09890;margin:0 0 8px;font-family:sans-serif;">Tracking details</p>
        <p style="font-size:14px;color:#1a1714;margin:0 0 4px;font-family:sans-serif;"><strong>${courier || "Courier"}</strong></p>
        <p style="font-size:13px;color:#7a6f68;margin:0;font-family:sans-serif;">Tracking ID: <strong>${tracking_number}</strong></p>
      </div>` : "";

        await sendEmail({
            to: email,
            subject: "Your order is on its way — The Ritual Co.",
            html: `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;font-family:sans-serif;">The Ritual Co.</p>
  <h1 style="font-size:24px;font-weight:400;margin:0 0 8px;">It's on its way, ${name}.</h1>
  <p style="font-size:15px;color:#7a6f68;line-height:1.7;margin:0 0 24px;">Your order has been dispatched and is headed to you. Delivery usually takes 2–5 working days once shipped.</p>

  <div style="border:0.5px solid #e8e2dc;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
    <table style="width:100%;font-size:13px;border-collapse:collapse;font-family:sans-serif;">
      <tr><td style="color:#a09890;padding:4px 0;">Product</td><td style="text-align:right;">${order.product_name || "Capsule Dumbbells"}</td></tr>
      <tr><td style="color:#a09890;padding:4px 0;">Colour</td><td style="text-align:right;">${order.color || "—"}</td></tr>
      <tr><td style="color:#a09890;padding:4px 0;">Weight</td><td style="text-align:right;">${order.weight || "—"}</td></tr>
      <tr><td style="color:#a09890;padding:4px 0;">Amount paid</td><td style="text-align:right;">₹${amount}</td></tr>
      <tr><td style="color:#a09890;padding:4px 0;">Delivering to</td><td style="text-align:right;font-size:12px;">${order.shipping_address || "—"}</td></tr>
    </table>
  </div>

  ${trackingHtml}

  <p style="font-size:13px;color:#7a6f68;line-height:1.7;">Questions? Reply to this email or DM us on <a href="https://instagram.com/theritualco.in" style="color:#3a3330;">Instagram</a>.</p>
  <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0 20px;"/>
  <p style="font-size:12px;color:#a09890;margin:0;">— Gitika & the Ritual Co. team</p>
  <p style="font-size:11px;color:#c0b8b0;margin:8px 0 0;font-family:sans-serif;"><a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a></p>
</div>`,
        }).catch(e => console.error("[SHIPPING_EMAIL_ERROR]", e.message));
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
};