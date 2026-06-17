// netlify/functions/creator-data.js
// Serves creator data to the creator dashboard
// GET  — fetch all creators
// PATCH — update a creator's status/fields

const https = require("https");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => resolve({ status: res.statusCode, body: data }));
        });
        req.on("error", reject);
        if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
        req.end();
    });
}

function validateToken(token) {
    if (!token) return false;
    const [expires, hmac] = token.split(".");
    if (!expires || !hmac) return false;
    if (Date.now() > parseInt(expires, 10)) return false;
    const expected = crypto
        .createHmac("sha256", process.env.ADMIN_PASSWORD)
        .update(expires)
        .digest("hex");
    return hmac === expected;
}

function supabaseReq(path, method, body, params) {
    method = method || "GET";
    params = params || "";
    const hostname = new URL(SUPABASE_URL).hostname;
    const payload = body ? JSON.stringify(body) : null;
    return request({
        hostname,
        path: "/rest/v1/" + path + params,
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            "Prefer": method === "POST" ? "return=representation" : "return=representation",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
    }, payload);
}

exports.handler = async function(event) {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    // Auth
    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!validateToken(token)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorised" }) };
    }

    // GET — fetch all creators
    if (event.httpMethod === "GET") {
        const res = await supabaseReq("creators", "GET", null, "?order=follower_count.desc");
        let creators = [];
        try { const d = JSON.parse(res.body); creators = Array.isArray(d) ? d : []; } catch {}
        return { statusCode: 200, headers, body: JSON.stringify({ creators }) };
    }

    // PATCH — update creator
    if (event.httpMethod === "PATCH") {
        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}
        const { id, ...fields } = body;
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "id required" }) };
        const res = await supabaseReq("creators?id=eq." + id, "PATCH", fields);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
};