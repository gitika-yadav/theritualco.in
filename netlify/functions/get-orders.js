const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Verify the user's JWT from Authorization header
    const token = (event.headers.authorization || "").replace("Bearer ", "");
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
    }

    const { data: orders, error } = await supabase
        .from("orders")
        .select("id, product_name, weight, color, amount_paise, status, created_at, razorpay_payment_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ orders }),
    };
};