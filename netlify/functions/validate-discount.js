const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { code, cart_total, email } = JSON.parse(event.body || "{}");
    if (!code || !cart_total) return { statusCode: 400, body: JSON.stringify({ error: "Missing code or cart_total" }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch the discount code
    const { data: discount, error } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("code", code.toUpperCase().trim())
        .single();

    if (error || !discount) {
        return { statusCode: 404, body: JSON.stringify({ error: "Invalid discount code" }) };
    }

    // Check if active
    if (!discount.active) {
        return { statusCode: 400, body: JSON.stringify({ error: "This code is no longer active" }) };
    }

    // Check expiry
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        return { statusCode: 400, body: JSON.stringify({ error: "This code has expired" }) };
    }

    // Check usage limit
    if (discount.usage_limit && discount.used_count >= discount.usage_limit) {
        return { statusCode: 400, body: JSON.stringify({ error: "This code has reached its usage limit" }) };
    }

    // Check minimum order
    if (discount.min_order_amount && cart_total < discount.min_order_amount) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Minimum order of ₹${discount.min_order_amount} required for this code` })
        };
    }

    // Check first order only
    if (discount.first_order_only && email) {
        const { data: existingOrders } = await supabase
            .from("orders")
            .select("id")
            .eq("guest_email", email.toLowerCase())
            .eq("status", "paid")
            .limit(1);
        if (existingOrders && existingOrders.length > 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "This code is for first orders only" }) };
        }
    }

    // Calculate discount amount
    let discount_amount = 0;
    let free_shipping = false;

    if (discount.type === "percentage") {
        discount_amount = Math.round((cart_total * discount.value) / 100);
        if (discount.max_discount && discount_amount > discount.max_discount) {
            discount_amount = discount.max_discount;
        }
    } else if (discount.type === "fixed") {
        discount_amount = Math.min(discount.value, cart_total);
    } else if (discount.type === "free_shipping") {
        free_shipping = true;
        discount_amount = 0;
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            valid: true,
            code: discount.code,
            type: discount.type,
            value: discount.value,
            discount_amount,
            free_shipping,
            description: discount.description || "",
        }),
    };
};