const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

exports.handler = async (event) => {
    const token = getTokenFromEvent(event);
    if (!verifyAdminToken(token)) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    return { statusCode: 200, body: JSON.stringify({ orders: data }) };
};