const Razorpay = require("razorpay");
const crypto = require("crypto");
const { isProdHost } = require("./shared/ga4");
const { createClient } = require("@supabase/supabase-js");
const { PRODUCT_MAP, resolveProductKey } = require("./shared/product-map");
const { KIT_MAP, PREORDER_SHIPS } = require("./shared/kit-map");

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

        // COD: no fee. The shopper pays a small advance online now and the rest
        // on delivery, which cuts refusals at the door. The order only becomes a
        // live COD order (cod_unpaid) once verify-payment confirms the advance.
        const COD_ADVANCE_PAISE = 19900; // ₹199
        const payNowPaise = isCod ? Math.min(COD_ADVANCE_PAISE, totalPaise) : totalPaise;

        const razorpay = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        const rzOrder = await razorpay.orders.create({
            amount:   payNowPaise,
            currency: "INR",
            receipt:  (isCod ? "ritual_cod_" : "ritual_") + Date.now(),
            notes:    { customer: name, items: orderItems.length, cod_advance: isCod ? "yes" : "no" },
        });

// ── Save ONE order row for the whole cart ────────────────
        const orderData = {
            razorpay_order_id: rzOrder.id,
            status:            "pending",
            payment_method:    isCod ? "cod" : "online",
            items:             orderItems,
            amount_paise:      totalPaise,
            shipping_address:  [address, landmark, city, state, pincode].filter(Boolean).join(", "),
        };
        // Gift: recipient goes on the parcel, message on a card, no prices inside.
        if (body.gift && typeof body.gift === "object" && String(body.gift.recipient || "").trim()) {
            const giftPhone = String(body.gift.recipient_phone || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
            if (!/^[6-9]\d{9}$/.test(giftPhone)) {
                return { statusCode: 400, body: JSON.stringify({ error: "Please enter the gift recipient's 10-digit mobile number." }) };
            }
            const clean = (v, n) => String(v || "").replace(/[<>]/g, "").trim().slice(0, n);
            orderData.is_gift = true;
            orderData.gift_recipient = clean(body.gift.recipient, 80);
            orderData.gift_recipient_phone = clean(body.gift.recipient_phone, 15).replace(/[^\d+ ]/g, "") || null;
            orderData.gift_message = clean(body.gift.message, 200) || null;
            orderData.gift_token = crypto.randomBytes(9).toString("base64url");
        }
        // GA4: browser ids so the server-side purchase keeps the visit's attribution.
        const ga = (body.ga && typeof body.ga === "object") ? body.ga : {};
        orderData.ga_client_id  = /^\d+\.\d+$/.test(String(ga.client_id || "")) ? String(ga.client_id) : null;
        orderData.ga_session_id = /^\d+$/.test(String(ga.session_id || "")) ? String(ga.session_id) : null;
        orderData.ga_skip       = !!ga.staff || !isProdHost(event);
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

        return {
            statusCode: 200,
            body: JSON.stringify({
                order_id:          rzOrder.id,
                amount:            payNowPaise,         // charged now (the ₹199 advance for COD)
                total:             totalPaise,
                due_on_delivery:   totalPaise - payNowPaise,
                currency:          "INR",
                internal_order_ids: order.id,
                items:             orderItems,
                payment_method:    isCod ? "cod" : "online",
                gift_token:        orderData.gift_token || null,
            }),
        };

    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
