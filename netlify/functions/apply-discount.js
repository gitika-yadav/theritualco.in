// Called after successful payment to increment usage count
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { code } = JSON.parse(event.body || "{}");
    if (!code) return { statusCode: 400, body: "Missing code" };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { error } = await supabase.rpc("increment_discount_usage", { p_code: code.toUpperCase().trim() });
    if (error) console.error("[DISCOUNT_USAGE_ERROR]", error.message);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
};