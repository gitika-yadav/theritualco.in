const BLOCKED_DOMAINS = [
    "test.com", "example.com", "mailinator.com",
    "guerrillamail.com", "yopmail.com", "tempmail.com",
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Rate limiter ──────────────────────────────────────────────
const rateLimitMap = new Map();
const WINDOW_MS = 60 * 1000;
const MAX = 3;
function isRateLimited(ip) {
    const now = Date.now();
    const e = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - e.start > WINDOW_MS) { rateLimitMap.set(ip, { count: 1, start: now }); return false; }
    if (e.count >= MAX) return true;
    e.count++; rateLimitMap.set(ip, e); return false;
}

async function sendEmail({ to, replyTo, subject, html }) {
    const body = {
        from: "The Ritual Co <hello@theritualco.in>",
        to,
        subject,
        html,
    };
    if (replyTo) body.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
    return res.json();
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
    if (isRateLimited(ip)) {
        return { statusCode: 429, body: JSON.stringify({ error: "Too many requests. Please wait a moment." }) };
    }

    let data;
    try { data = JSON.parse(event.body); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid request" }) }; }

    const { name, email, topic, orderId, message, company, "g-recaptcha-response": token } = data;

    // Honeypot — silently succeed for bots
    if (company) {
        return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    }

    // reCAPTCHA
    if (!token) return { statusCode: 403, body: JSON.stringify({ error: "Missing captcha" }) };
    let recaptcha;
    try {
        const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}&remoteip=${ip}`,
        });
        recaptcha = await r.json();
    } catch {
        return { statusCode: 500, body: JSON.stringify({ error: "Captcha verification failed" }) };
    }
    if (!recaptcha.success || recaptcha.score < 0.5) {
        return { statusCode: 403, body: JSON.stringify({ error: "Captcha failed" }) };
    }

    // Validate
    const cleanName    = (name || "").trim();
    const cleanEmail   = (email || "").trim().toLowerCase();
    const cleanTopic   = (topic || "General").trim().slice(0, 60);
    const cleanOrderId = (orderId || "").trim().slice(0, 40);
    const cleanMessage = (message || "").trim();
    const domain = cleanEmail.split("@")[1];

    if (cleanName.length < 2 || cleanName.length > 100)
        return { statusCode: 400, body: JSON.stringify({ error: "Please enter your name." }) };
    if (!EMAIL_REGEX.test(cleanEmail) || BLOCKED_DOMAINS.includes(domain))
        return { statusCode: 400, body: JSON.stringify({ error: "Please enter a valid email." }) };
    if (cleanMessage.length < 5 || cleanMessage.length > 5000)
        return { statusCode: 400, body: JSON.stringify({ error: "Please enter a message." }) };

    const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    try {
        // Notify owner — this is the email YOU receive
        await sendEmail({
            to: "theritualcoofficial@gmail.com",
            replyTo: cleanEmail, // so you can reply straight to the customer
            subject: `✉️ Contact form — ${cleanTopic} — ${cleanName}`,
            html: `
<h2 style="font-family:sans-serif">New Contact Message</h2>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
  <tr><td style="padding:6px 20px 6px 0;color:#888">Name</td><td><strong>${cleanName}</strong></td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Email</td><td>${cleanEmail}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Topic</td><td>${cleanTopic}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Order #</td><td>${cleanOrderId || "—"}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Time</td><td>${time} IST</td></tr>
</table>
<p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;margin-top:16px;padding:14px;background:#f7f2ec;border-radius:8px;">${cleanMessage.replace(/</g, "&lt;")}</p>
<p style="font-family:sans-serif;font-size:12px;color:#999;">Reply directly to this email to respond to ${cleanName}.</p>`,
        });

        // Auto-acknowledge the sender
        await sendEmail({
            to: cleanEmail,
            replyTo: "theritualcoofficial@gmail.com",
            subject: "We've got your message — The Ritual Co.",
            html: `
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#3a3330;padding:40px 24px;">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
  <h1 style="font-size:24px;font-weight:400;margin:0 0 8px;">Thanks for reaching out.</h1>
  <p style="font-size:15px;color:#7a6f68;line-height:1.7;margin:0 0 24px;">
    Hi ${cleanName}, we've received your message and will reply within 24 hours.
  </p>
  <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0;">
  <p style="font-size:13px;color:#a09890;margin:0;">— Gitika &amp; the Ritual Co. team</p>
</div>`,
        }).catch(() => {}); // don't fail the whole request if the auto-reply bounces

        return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    } catch (err) {
        console.error("[CONTACT_ERROR]", err.message);
        return { statusCode: 500, body: JSON.stringify({ error: "Could not send. Please email us directly." }) };
    }
};