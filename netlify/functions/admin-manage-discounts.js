const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function verifyAdminToken(token) {
    if (!token) return false;
    const [expires, hmac] = token.split(".");
    if (!expires || !hmac) return false;
    if (Date.now() > parseInt(expires)) return false;
    const expected = crypto.createHmac("sha256", process.env.ADMIN_PASSWORD).update(expires).digest("hex");
    try { return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected)); } catch { return false; }
}

exports.handler = async (event) => {
    if (!verifyAdminToken(event.headers["x-admin-token"])) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // GET — list all codes
    if (event.httpMethod === "GET") {
        const { data, error } = await supabase
            .from("discount_codes")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, body: JSON.stringify({ codes: data }) };
    }

    // POST — create or update
    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        const { action, id, ...fields } = body;

        if (action === "delete") {
            const { error } = await supabase.from("discount_codes").delete().eq("id", id);
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        if (action === "toggle") {
            const { data: current } = await supabase.from("discount_codes").select("active").eq("id", id).single();
            const { error } = await supabase.from("discount_codes").update({ active: !current.active }).eq("id", id);
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        if (action === "create") {
            const insert = {
                code: (fields.code || "").toUpperCase().trim(),
                type: fields.type,
                value: Number(fields.value),
                description: fields.description || "",
                min_order_amount: fields.min_order_amount ? Number(fields.min_order_amount) : null,
                max_discount: fields.max_discount ? Number(fields.max_discount) : null,
                usage_limit: fields.usage_limit ? Number(fields.usage_limit) : null,
                first_order_only: fields.first_order_only || false,
                expires_at: fields.expires_at || null,
                active: true,
                used_count: 0,
            };
            if (!insert.code || !insert.type || (!insert.value && insert.type !== "free_shipping")) {
                return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
            }
            const { data, error } = await supabase.from("discount_codes").insert(insert).select().single();
            if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
            return { statusCode: 200, body: JSON.stringify({ code: data }) };
        }

        return { statusCode: 400, body: "Unknown action" };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
};