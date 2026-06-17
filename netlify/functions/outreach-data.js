// netlify/functions/outreach-data.js
// Serves contacts data to outreach dashboard
// GET   — fetch all contacts
// POST  — add contact OR send email (action: 'send_email')
// PATCH — update contact fields

const https = require("https");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "hello@theritualco.in";

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
            "Prefer": method === "POST" ? "return=representation" : "",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
    }, payload);
}

async function sendEmail(to, subject, message, contactName) {
    const html = '<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px">' +
        '<p style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6660;margin-bottom:24px">The Ritual Co · hello@theritualco.in</p>' +
        '<div style="font-size:14px;line-height:1.8;color:#1a1814;white-space:pre-wrap">' + message + '</div>' +
        '</body></html>';

    const payload = JSON.stringify({
        from: "Gitika — The Ritual Co <" + FROM_EMAIL + ">",
        to: [to],
        reply_to: "theritualcoofficial@gmail.com",
        subject,
        html,
    });

    const res = await request({
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
            Authorization: "Bearer " + RESEND_KEY,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
        },
    }, payload);

    return res.status === 200 || res.status === 201;
}

exports.handler = async function(event) {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!validateToken(token)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorised" }) };
    }

    // GET — fetch all contacts
    if (event.httpMethod === "GET") {
        const res = await supabaseReq("contacts", "GET", null, "?order=created_at.desc");
        let contacts = [];
        try { const d = JSON.parse(res.body); contacts = Array.isArray(d) ? d : []; } catch {}
        return { statusCode: 200, headers, body: JSON.stringify({ contacts }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}

    // POST — add contact or send email
    if (event.httpMethod === "POST") {
        // Send email action
        if (body.action === "send_email") {
            const { to, subject, message, contactId } = body;
            if (!to || !message) return { statusCode: 400, headers, body: JSON.stringify({ error: "to and message required" }) };
            const ok = await sendEmail(to, subject || "The Ritual Co", message);
            if (!ok) return { statusCode: 500, headers, body: JSON.stringify({ error: "Email send failed" }) };
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        // Add new contact
        const { action, ...fields } = body;
        if (!fields.name || !fields.type) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "name and type required" }) };
        }
        const res = await supabaseReq("contacts", "POST", fields);
        let created = null;
        try { const d = JSON.parse(res.body); created = Array.isArray(d) ? d[0] : d; } catch {}
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contact: created }) };
    }

    // PATCH — update contact
    if (event.httpMethod === "PATCH") {
        const { id, ...fields } = body;
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "id required" }) };
        fields.updated_at = new Date().toISOString();
        await supabaseReq("contacts?id=eq." + id, "PATCH", fields);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
};