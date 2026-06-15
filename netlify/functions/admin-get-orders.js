const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
    const crypto = require("crypto");
    function verifyAdminToken(token) {
        if (!token) return false;
        const [expires, hmac] = token.split(".");
        if (!expires || !hmac) return false;
        if (Date.now() > parseInt(expires)) return false;
        const expected = crypto.createHmac("sha256", process.env.ADMIN_PASSWORD).update(expires).digest("hex");
        try { return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected)); } catch { return false; }
    }

    if (!verifyAdminToken(event.headers["x-admin-token"])) {
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