const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

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

    if (!verifyAdminToken(getTokenFromEvent(event))) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const { order_id, status, tracking_number, courier } = JSON.parse(event.body);
    if (!order_id || !status) return { statusCode: 400, body: "Missing order_id or status" };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch order first — now a single row with an items array covering the
    // whole order, so marking shipped ships everything in one action.
    const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .single();
    if (fetchErr || !order) return { statusCode: 404, body: "Order not found" };

    // Allowed moves. Anything else is refused so a typo can't put an order in a
    // strange state.
    //   to-ship → shipped                 (normal dispatch; emails the customer)
    //   shipped → delivered | rto | returned
    //   delivered → shipped (undo) | rto
    //   rto → returned (parcel back with us: restocks once) | shipped (undo)
    //   returned → rto | shipped (undo: takes the restocked units back out)
    const TO_SHIP = ["paid", "cod_unpaid", "gifted"];
    const MOVES = {
        shipped:   [...TO_SHIP, "delivered", "rto", "returned"],
        delivered: ["shipped", "rto"],
        rto:       ["shipped", "delivered", "returned"],
        returned:  ["rto", "shipped"],
    };
    const prev = order.status;
    if (prev !== status && !(MOVES[status] || []).includes(prev)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Can't move an order from "${prev}" to "${status}".` }) };
    }
    const isUndo = status === "shipped" && !TO_SHIP.includes(prev);

    const now = new Date().toISOString();
    const updates = { status };
    if (tracking_number) updates.tracking_number = tracking_number;
    if (courier) updates.courier = courier;
    if (status === "shipped" && !isUndo) updates.shipped_at = now;
    if (status === "shipped" && isUndo) { updates.delivered_at = null; updates.rto_at = null; }
    if (status === "delivered") updates.delivered_at = now;
    if (status === "rto" && prev !== "returned") { updates.rto_at = now; updates.delivered_at = null; }
    if (prev === "returned" && status !== "returned") { updates.returned_at = null; }
    if (status === "returned") { updates.returned_at = now; if (!order.rto_at) updates.rto_at = now; }

    // Units this order took from stock (kits expand to their parts; pre-orders never took stock).
    const stockParts = () => (order.items || []).filter(i => !i.is_preorder).flatMap(i =>
        i.is_kit && Array.isArray(i.kit_components) && i.kit_components.length
            ? i.kit_components.map(c => ({ id: c.product_id, color: c.color, qty: (c.quantity || 1) * (i.quantity || 1) }))
            : [{ id: i.product_id, color: i.color, qty: i.quantity ?? i.qty ?? 1 }]);

    // Parcel is back with us → put the units back on the shelf (only once).
    let restocked = [];
    if (status === "returned" && !order.restocked_at) {
        for (const part of stockParts()) {
            const { error } = await supabase.rpc("restock_item", { p_product_id: part.id, p_color: part.color, p_qty: part.qty });
            if (error) console.error("[RESTOCK_ERROR]", part, error.message);
            else restocked.push(`${part.id} ${part.color || ""} ×${part.qty}`.trim());
        }
        updates.restocked_at = now;
    }

    // "Received back" clicked by mistake → take those units back out of stock.
    let unrestocked = [];
    if (prev === "returned" && status !== "returned" && order.restocked_at) {
        for (const part of stockParts()) {
            const { error } = await supabase.rpc("unrestock_item", { p_product_id: part.id, p_color: part.color, p_qty: part.qty });
            if (error) console.error("[UNRESTOCK_ERROR]", part, error.message);
            else unrestocked.push(`${part.id} ${part.color || ""} ×${part.qty}`.trim());
        }
        updates.restocked_at = null;
    }

    const { error: updateErr } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order_id);
    if (updateErr) return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };

    // Send shipping email only on a real dispatch (never on an undo)
    if (status === "shipped" && !isUndo && (order.guest_email || order.customer_email)) {
        const email = order.guest_email || order.customer_email;
        const name = (order.guest_name || order.customer_name || "there").split(" ")[0];
        const amount = (order.amount_paise / 100).toLocaleString("en-IN");
        const items = order.items || [];

        const itemRows = items.map(i =>
            `<tr><td style="color:#a09890;padding:4px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight || ""}${i.weight && i.color ? " · " : ""}${i.color || ""} × ${i.quantity ?? i.qty ?? 1}</td></tr>`
        ).join("");

        const trackingHtml = tracking_number ? `
        <div style="background:#f9f6f2;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a09890;margin:0 0 8px;font-family:sans-serif;">Tracking details</p>
            <p style="font-size:14px;color:#1a1714;margin:0 0 4px;font-family:sans-serif;"><strong>${courier || "Courier"}</strong></p>
            <p style="font-size:13px;color:#7a6f68;margin:0;font-family:sans-serif;">Tracking ID: <strong>${tracking_number}</strong></p>
            ${courier === "Delhivery" ? `<p style="margin:12px 0 0;font-family:sans-serif;"><a href="https://www.delhivery.com/track-v2/package/${encodeURIComponent(tracking_number)}" style="display:inline-block;background:#3a3330;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Track your parcel</a></p>` : ""}
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
                        ${itemRows}
                        <tr><td style="color:#a09890;padding:6px 0;border-top:1px solid #e8e2dc;">Amount paid</td><td style="text-align:right;border-top:1px solid #e8e2dc;">₹${amount}</td></tr>
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

    return { statusCode: 200, body: JSON.stringify({ success: true, restocked, unrestocked }) };
};