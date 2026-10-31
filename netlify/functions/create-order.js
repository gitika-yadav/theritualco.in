const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");
const { PRODUCT_MAP, resolveProductKey } = require("./shared/product-map");
const { KIT_MAP, PREORDER_SHIPS } = require("./shared/kit-map");
const { sendPurchase } = require("./shared/meta-capi");

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
        const { cart, name, email, phone, address, landmark, pincode, city, state, user_id, payment_method } = body;
        const isCod = payment_method === "cod";

        if (!cart || !cart.length || !name || !email || !phone || !address) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
        }

        // ── Calculate total from cart ─────────────
        // Always validate price server-side against inventory
        let totalPaise = 0;
        let noCodePaise = 0; // kit lines already discounted: discount codes don't apply to them
        const orderItems = [];


        // Units already claimed by earlier cart lines, per product + colour,
        // so a kit and a single (or two kits) can't both take the last unit.
        const reserved = {};
        const resKey = (pid, color) => pid + "|" + String(color || "default").toLowerCase();

        for (const item of cart) {
            const kit = KIT_MAP[item.id];

            if (kit) {
                // ── Kit purchase: validate + price EVERY component, all in the
                //    customer's chosen colour. If ANY component isn't active in
                //    that colour, the whole kit line is skipped (all-or-nothing —
                //    a kit can't ship half-finished).
                const kitColor = item.color || "default";
                const kitQty   = Math.max(1, Math.min(10, parseInt(item.qty) || 1));
                let kitValid = true;
                let shortOf  = null;
                const kitLineItems = [];

                for (const comp of kit.components) {
                    const compProduct = PRODUCT_MAP[comp.product_id];
                    if (!compProduct) { kitValid = false; break; }
                    const compColor = comp.color || (comp.colorMap && comp.colorMap[kitColor]) || kitColor; // fixed-colour sets (e.g. sock trio) override the chosen colour; colorMap swaps a missing shade (pink kit -> cream belt)

                    const { data: inv, error: invErr } = await supabase
                        .from("inventory")
                        .select("active, stock")
                        .eq("product_id", comp.product_id)
                        .eq("color", compColor)
                        .single();

                    if (invErr || !inv || !inv.active) { kitValid = false; break; }

                    // ── Stock guard: every piece of the kit must be in stock ──
                    const need = (comp.qty || 1) * kitQty;
                    const have = (Number(inv.stock) || 0) - (reserved[resKey(comp.product_id, compColor)] || 0);
                    if (have < need) {
                        shortOf = shortOf || (compProduct.name + " (" + compColor + ")");
                        // Pre-order kits keep going so the full kit is recorded; others stop here.
                        if (!kit.preorder) { kitValid = false; break; }
                    }

                    kitLineItems.push({
                        product_id:    comp.product_id,
                        product_name:  compProduct.name + " (from " + kit.name + ")",
                        weight:        compProduct.weight,
                        color:         compColor,
                        quantity:      comp.qty,
                        unit_paise:    0, // component price not separately charged — kit has one bundled price
                        is_early_bird: false,
                        is_kit_component: true,
                    });
                }

                const isPreorder = !!(shortOf && kit.preorder);
                if (shortOf && !isPreorder) {
                    return {
                        statusCode: 409,
                        body: JSON.stringify({
                            error: `${kit.name} is out of stock right now (${shortOf} unavailable). Please remove it from your cart and try again.`,
                            code: "OUT_OF_STOCK",
                            product: kit.name,
                            color: kitColor,
                        }),
                    };
                }
                if (!kitValid) {
                    console.error(`Kit "${kit.id}" unavailable in colour "${kitColor}" — one or more components inactive`);
                    continue; // whole kit skipped, matches existing silent-skip pattern elsewhere in this loop
                }

                // A pre-order takes no stock now; it's fulfilled from the restock.
                if (!isPreorder) {
                    for (const c of kitLineItems) {
                        const k = resKey(c.product_id, c.color);
                        reserved[k] = (reserved[k] || 0) + c.quantity * kitQty;
                    }
                }

                // One summary line for what the customer actually bought...
                totalPaise += kit.price_paise * kitQty;
                if (kit.noCodes) noCodePaise += kit.price_paise * kitQty;
                orderItems.push({
                    product_id:    kit.id,
                    product_name:  isPreorder ? `${kit.name} (Pre-order — ships ${PREORDER_SHIPS})` : kit.name,
                    weight:        null,
                    color:         kitColor,
                    quantity:      kitQty,
                    unit_paise:    kit.price_paise,
                    is_early_bird: false,
                    is_kit: true,
                    is_preorder: isPreorder,
                    kit_components: kitLineItems, // ...plus the full breakdown, for packing/fulfillment
                });

                continue; // skip the normal single-product resolution below for this cart entry
            }

            // ── Normal (non-kit) product — existing logic, unchanged ───
            const key = resolveProductKey(item);
            const product = key && PRODUCT_MAP[key];
            if (!product) continue;

            const { data: inv, error: invErr } = await supabase
                .from("inventory")
                .select("stock, sold, early_bird_limit, early_bird_price_paise, price_paise, active, sku")
                .eq("product_id", product.id)
                .eq("color", item.color || "default")
                .single();
            if (invErr || !inv || !inv.active) continue;

            const isEarlyBird = inv.sold < inv.early_bird_limit;
            const unitPaise   = isEarlyBird ? inv.early_bird_price_paise : inv.price_paise;
            const qty         = Math.max(1, Math.min(10, parseInt(item.qty) || 1));

            // ── Stock guard: reject if insufficient remaining units ──
            const remaining = (Number(inv.stock) || 0) - (reserved[resKey(product.id, item.color)] || 0);
            const isPreorder = remaining < qty && !!product.preorder;
            if (remaining < qty && !isPreorder) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({
                        error: `Only ${remaining} unit${remaining === 1 ? "" : "s"} of ${product.name} (${item.color || "default"}) left in stock. Please reduce the quantity and try again.`,
                        code: "OUT_OF_STOCK",
                        available: remaining,
                        product: product.name,
                        color: item.color || "default",
                    }),
                };
            }

            if (!isPreorder) reserved[resKey(product.id, item.color)] = (reserved[resKey(product.id, item.color)] || 0) + qty;
            totalPaise += unitPaise * qty;
            orderItems.push({
                product_id:    product.id,
                product_name:  isPreorder ? `${product.name} (Pre-order — ships ${PREORDER_SHIPS})` : product.name,
                weight:        product.weight,
                color:         item.color || "Not specified",
                quantity:      qty,
                sku_id:        inv.sku || null,
                unit_paise:    unitPaise,
                is_early_bird: isEarlyBird,
                is_preorder:   isPreorder,
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

            const codePaise = Math.max(0, totalPaise - noCodePaise); // codes only apply to non-kit items
            const cartRupees = codePaise / 100;
            const valid = dc && dc.active
                && (!dc.expires_at || new Date(dc.expires_at) >= new Date())
                && (!dc.usage_limit || dc.used_count < dc.usage_limit)
                && (!dc.min_order_amount || cartRupees >= dc.min_order_amount);

            if (valid) {
                if (dc.type === "percentage") {
                    discountPaise = Math.round((codePaise * dc.value) / 100);
                    if (dc.max_discount) discountPaise = Math.min(discountPaise, dc.max_discount * 100);
                } else if (dc.type === "fixed") {
                    discountPaise = Math.min(dc.value * 100, codePaise);
                }
                // free_shipping: nothing to subtract (shipping already free)
            }
        }
        totalPaise = Math.max(0, totalPaise - discountPaise);

        const COD_FEE_PAISE = 9900; // ₹99
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
        const receiptId = isCod ? codReceipt : rzOrder.id;

// ── Save ONE order row for the whole cart ────────────────
        const orderData = {
            razorpay_order_id: isCod ? codReceipt : rzOrder.id,
            status:            isCod ? "cod_unpaid" : "pending",
            payment_method:    isCod ? "cod" : "online",
            items:             orderItems,
            amount_paise:      totalPaise,
            shipping_address:  [address, landmark, city, state, pincode].filter(Boolean).join(", "),
        };
        if (user_id) {
            orderData.user_id = user_id;
        } else {
            orderData.guest_name  = name;
            orderData.guest_email = email;
            orderData.guest_phone = phone;
        }

        const { data: order, error: insertErr } = await supabase
            .from("orders").insert(orderData).select("id").single();

        if (insertErr || !order) {
            console.error("Order insert error:", insertErr);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to save order — please try again." }) };
        }

        if (isCod) {
            for (const orderItem of orderItems) {
                if (orderItem.is_preorder) continue; // no stock to take yet — fulfilled at restock
                if (orderItem.is_kit) {
                    // Decrement each component separately
                    for (const comp of orderItem.kit_components) {
                        const { error: invErr } = await supabase.rpc("increment_sold", {
                            p_product_id: comp.product_id,
                            p_color:      comp.color,
                            p_qty:        (comp.quantity || 1) * (orderItem.quantity || 1),
                        });
                        if (invErr) console.error("Kit component inventory increment error:", invErr, comp.product_id, comp.color);
                    }
                } else {
                    const { data: ok, error: invErr } = await supabase.rpc("increment_sold", {
                        p_product_id: orderItem.product_id,
                        p_color:      orderItem.color,
                        p_qty:        orderItem.quantity || 1,
                    });
                    if (invErr) console.error("COD inventory increment error:", invErr);
                    else if (ok === false) console.error("COD oversell rejected:", item.product_id, item.color);
                }
            }
        }

        if (isCod && process.env.RESEND_API_KEY) {
            const amount    = (totalPaise / 100).toLocaleString("en-IN");
            const orderTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            const itemLines = orderItems.map(i =>
                `<tr><td style="color:#a09890;padding:6px 0;">${i.product_name}</td><td style="text-align:right;">${i.weight} · ${i.color} × ${i.quantity}</td></tr>`
            ).join("");

            // Customer confirmation
            await sendEmail({
                to: email,
                subject: "Your COD order is confirmed ✦ The Ritual Co.",
                html: `
                        <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #3a3330; padding: 40px 24px;">
                        <p style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #a09890; margin: 0 0 32px;">The Ritual Co.</p>
                        <h1 style="font-size: 24px; font-weight: 400; margin: 0 0 8px;">Order confirmed — pay on delivery.</h1>
                        <p style="font-size: 15px; color: #7a6f68; margin: 0 0 32px;">Thank you, ${name.split(" ")[0]}. Your order is reserved and will ship soon.</p>
                        <div style="border: 1px solid #e8e2dc; border-radius: 10px; padding: 20px 24px; margin-bottom: 32px;">
                        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                        ${itemLines}
                        <tr><td style="color:#a09890;padding-top:10px;border-top:1px solid #e8e2dc;">Amount due on delivery</td><td style="text-align:right;font-weight:500;padding-top:10px;border-top:1px solid #e8e2dc;">₹${amount}</td></tr>
                        </table>
                        </div>
                        <p style="font-size: 13px; color: #7a6f68; line-height: 1.7; margin: 0 0 24px;">
                        Please keep the exact amount ready for our delivery partner. We'll send a shipping notification with tracking details once dispatched.
                        </p>
                        <p style="font-size: 13px; color: #a09890; margin: 0;">— Gitika &amp; the Ritual Co. team</p>
                        <hr style="border: none; border-top: 1px solid #e8e2dc; margin: 32px 0;">
                        <p style="font-size: 11px; color: #c0b8b0; margin: 0;">
                        The Ritual Co. · <a href="https://theritualco.in" style="color: #c0b8b0;">theritualco.in</a>
                        </p>
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
                  <tr><td style="padding:6px 20px 6px 0;color:#888">Items</td><td>${orderItems.map(i => `${i.product_name} ${i.weight} ${i.color} ×${i.quantity}`).join("<br>")}</td></tr>
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

        // Meta Conversions API — COD orders are "purchased" now (online ones in verify-payment).
        // Same event_id as the browser Pixel's Purchase (rc_last_order.id) so Meta de-duplicates.
        if (isCod && !body.staff) {
            await sendPurchase({
                eventId: codReceipt, value: totalPaise / 100, items: orderItems,
                email, phone, name, city, state, zip: pincode,
                fbp: body.fbp, fbc: body.fbc, sourceUrl: body.source_url,
                headers: event.headers, externalId: email,
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                order_id:          isCod ? codReceipt : rzOrder.id,
                amount:            totalPaise,
                currency:          "INR",
                internal_order_ids: order.id,
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
            reply_to: "theritualcoofficial@gmail.com",
            to, subject, html,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}