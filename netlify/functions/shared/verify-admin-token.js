// netlify/functions/_shared/verify-admin-token.js
// Verifies the session token issued by admin-auth.js.
// Token format: "<expiresMs>.<hmacHex>" where hmacHex = HMAC-SHA256(ADMIN_PASSWORD, expiresMs)

const crypto = require("crypto");

function verifyAdminToken(token) {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [expiresStr, sig] = parts;
    const expires = parseInt(expiresStr, 10);
    if (!expires || Date.now() > expires) return false;

    const expected = crypto
        .createHmac("sha256", process.env.ADMIN_PASSWORD)
        .update(expiresStr)
        .digest("hex");

    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false; // length mismatch etc.
    }
}

function getTokenFromEvent(event) {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    if (auth.startsWith("Bearer ")) return auth.slice(7);
    return null;
}

module.exports = { verifyAdminToken, getTokenFromEvent };