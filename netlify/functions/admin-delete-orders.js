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
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    if (!verifyAdminToken(event.headers["x-admin-token"])) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const { order_ids, bulk_delete_pending } = JSON.parse(event.body || "{}");

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    let query;

    if (bulk_delete_pending) {
        // Delete all pending orders
        query = supabase.from("orders").delete().eq("status", "pending");
    } else if (order_ids && order_ids.length > 0) {
        // Delete specific order IDs
        query = supabase.from("orders").delete().in("id", order_ids);
    } else {
        return { statusCode: 400, body: "Provide order_ids or bulk_delete_pending" };
    }

    const { error, count } = await query;
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    console.info(`[ADMIN_DELETE] bulk_pending=${bulk_delete_pending}, ids=${order_ids?.join(",")}`);
    return { statusCode: 200, body: JSON.stringify({ success: true, deleted: count }) };
};