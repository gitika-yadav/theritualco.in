// netlify/functions/admin-auth.js
// Validates admin password and returns a short-lived session token

const crypto = require("crypto");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { password } = JSON.parse(event.body || "{}");

    if (!password || password !== process.env.ADMIN_PASSWORD) {
        // Add a small delay to slow down brute force
        await new Promise(r => setTimeout(r, 500));
        return { statusCode: 401, body: JSON.stringify({ error: "Incorrect password" }) };
    }

    // Generate a session token: HMAC of timestamp + secret
    // Valid for 8 hours
    const expires = Date.now() + 8 * 60 * 60 * 1000;
    const payload = `${expires}`;
    const token = crypto
        .createHmac("sha256", process.env.ADMIN_PASSWORD)
        .update(payload)
        .digest("hex");

    const sessionToken = `${expires}.${token}`;

    return {
        statusCode: 200,
        body: JSON.stringify({ token: sessionToken }),
    };
};