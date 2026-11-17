// netlify/functions/create-creator-order.js
// Admin-only endpoint for placing free creator/collaboration gifting orders.
// Not linked from any public page — protected by CREATOR_ORDER_SECRET.
// One order row per gift order, items as a JSONB array (matches the new
// orders schema — see migration-orders-items-jsonb.sql).
//
// source: "website" (default) → takes units from website stock (inventory).
// source: "event_pool"        → ships event stock (e.g. to a venue). Takes units
//   from the event pool by logging them against the event on the Event stock
//   page; website stock is untouched, no gift email, not counted as a gift.
// action: "event_pool"        → returns { pool, events } for the form.

const { createClient } = require("@supabase/supabase-js");
const { PRODUCT_MAP, resolveProductKey } = require("./shared/product-map");
const { poolAvailable, poolSnapshot } = require("./shared/event-pool");

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

        if (body.action === "event_pool") {
            const snap = await poolSnapshot(supabase);
            return { statusCode: 200, body: JSON.stringify(snap) };
        }

        const fromPool = body.source === "event_pool";
        const eventName = (body.event_name || "").trim();
        if (fromPool && !eventName) {
            return { statusCode: 400, body: JSON.stringify({ error: "Pick the event this stock is going to" }) };
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
        const skippedItems = [];
        for (const item of items) {
            const key = resolveProductKey(item);
            const product = key && PRODUCT_MAP[key];
            if (!product) {
                console.error("Creator order: unresolvable product", item);
                skippedItems.push({ ...item, reason: "unresolvable product_id" });
                continue;
            }

            const { data: inv, error: invErr } = await supabase
                .from("inventory")
                .select("active, sku")
                .eq("product_id", product.id)
                .eq("color", item.color || "default")
                .single();
            if (!fromPool && (invErr || !inv || !inv.active)) {
                console.error("Creator order: item skipped — not found or inactive in inventory", product.id, item.color, invErr?.message);
                skippedItems.push({ ...item, reason: invErr ? "inventory lookup error" : "inactive or missing" });
                continue;
            }

            const qty = Math.max(1, Math.min(10, parseInt(item.qty) || 1));

            orderItems.push({
                product_id:   product.id,
                product_name: product.name,
                weight:       product.weight,
                color:        item.color || "Not specified",
                quantity:     qty,
                sku_id:       (inv && inv.sku) || null,
                ...(fromPool ? { from_event_pool: true } : {}),
            });
        }

        if (skippedItems.length > 0) {
            console.error(`Creator order: ${skippedItems.length} of ${items.length} requested items were dropped:`, JSON.stringify(skippedItems));
        }

        if (orderItems.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No valid items in gift order" }) };
        }

        // ── Event pool: check every line has enough before saving anything ───
        if (fromPool) {
            const need = {};
            orderItems.forEach(i => { const k = i.product_id + "|" + i.color; need[k] = (need[k] || 0) + i.quantity; });
            for (const [k, qty] of Object.entries(need)) {
                const [pid, color] = k.split("|");
                const available = await poolAvailable(supabase, pid, color);
                if (qty > available) {
                    const name = (orderItems.find(i => i.product_id === pid) || {}).product_name || pid;
                    return { statusCode: 400, body: JSON.stringify({ error: `${name} · ${color}: only ${Math.max(available, 0)} in the event pool — add more on the Event stock page first` }) };
                }
            }
        }

        // ── Save ONE order row for the whole gift, amount_paise: 0 ───
        const giftReceipt = (fromPool ? "ritual_event_" : "ritual_gift_") + Date.now();
        const orderData = {
            razorpay_order_id: giftReceipt,
            status:            "gifted", // same "to ship" flow as gifts in orders.html
            payment_method:    fromPool ? "event_stock" : "creator_gift",
            ...(fromPool ? { channel: "event" } : {}),
            items:             orderItems,
            amount_paise:      0,
            shipping_address:  [address, landmark, city, state, pincode].filter(Boolean).join(", "),
            guest_name:        creator_handle ? `${creator_name} (${creator_handle})` : creator_name,
            guest_email:       email || null,
            guest_phone:       phone || null,
        };

        const { data: order, error: insertErr } = await supabase
            .from("orders").insert(orderData).select("id").single();

        if (insertErr || !order) {
            console.error("Creator order insert error:", insertErr);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to save gift order — please try again." }) };
        }

        // ── Event pool: log the units as sent to the event (pool goes down) ───
        if (fromPool) {
            const today = new Date().toISOString().slice(0, 10);
            const rows = orderItems.map(i => ({
                event_name:   eventName,
                product_id:   i.product_id,
                product_name: i.product_name,
                color:        i.color,
                qty_leased:   i.quantity,
                qty_returned: 0,
                date_out:     today,
                status:       "out",
                notes:        "Shipped via Delhivery · order " + giftReceipt,
            }));
            const { data: evRows, error: evErr } = await supabase.from("event_inventory").insert(rows).select("id");
            if (evErr) {
                await supabase.from("orders").delete().eq("id", order.id);
                console.error("Event stock log error:", evErr);
                return { statusCode: 500, body: JSON.stringify({ error: "Couldn't log the stock against the event — nothing was saved. " + evErr.message }) };
            }
            const withIds = orderItems.map((i, n) => ({ ...i, event_inventory_id: evRows[n] && evRows[n].id, event_name: eventName }));
            await supabase.from("orders").update({ items: withIds }).eq("id", order.id);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true, order_id: order.id, receipt: giftReceipt, source: "event_pool",
                    saved_items: orderItems.length, requested_items: items.length, skipped: skippedItems,
                }),
            };
        }

        // ── Decrement inventory for every gifted colour ───
        for (const item of orderItems) {
            const { data: ok, error: rpcErr } = await supabase.rpc("increment_sold", {
                p_product_id: item.product_id,
                p_color:      item.color,
                p_qty:        item.quantity || 1,
            });
            if (rpcErr) console.error("Creator gift inventory increment error:", rpcErr, "item:", item.product_id, item.color);
            else if (ok === false) console.error("Creator gift oversell rejected:", item.product_id, item.color);
        }

        // ── Send gift shipping confirmation (no pricing shown) ───
        if (email && process.env.RESEND_API_KEY) {
            await sendGiftEmail({ to: email, name: creator_name, items: orderItems });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                order_id: order.id,
                receipt: giftReceipt,
                saved_items: orderItems.length,
                requested_items: items.length,
                skipped: skippedItems, // non-empty means some items didn't make it — surface this in the UI
            }),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function sendGiftEmail({ to, name, items }) {
    const itemLines = items.map(i =>
        `<tr><td style="color:#a09890;padding:6px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight} · ${i.color} × ${i.quantity}</td></tr>`
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