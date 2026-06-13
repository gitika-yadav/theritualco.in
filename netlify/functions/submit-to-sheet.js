const { google } = require("googleapis");

// ─── Email helper ──────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The Ritual Co <hello@theritualco.in>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
  return res.json();
}

// ─── Rate limiter ──────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

const BLOCKED_DOMAINS = [
  "test.com", "example.com", "mailinator.com",
  "guerrillamail.com", "yopmail.com", "tempmail.com",
  "throwam.com", "sharklasers.com", "trashmail.com",
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;

// ─── Handler ──────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    console.warn(`[RATE_LIMIT] IP: ${ip}`);
    return { statusCode: 429, body: "Too many requests. Please wait a moment." };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid request" };
  }

  const { name, email, phone, color, nickname, "g-recaptcha-response": token } = data;

  // Honeypot
  if (nickname) {
    console.warn(`[HONEYPOT] IP: ${ip}`);
    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
  }

  // reCAPTCHA
  if (!token) {
    console.warn(`[NO_CAPTCHA] IP: ${ip}`);
    return { statusCode: 403, body: "Missing captcha" };
  }

  let recaptchaData;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}&remoteip=${ip}`,
    });
    recaptchaData = await r.json();
  } catch (err) {
    console.error(`[CAPTCHA_FETCH_ERROR] ${err.message}`);
    return { statusCode: 500, body: "Captcha verification failed" };
  }

  if (!recaptchaData.success || recaptchaData.score < 0.5) {
    console.warn(`[CAPTCHA_FAIL] score: ${recaptchaData.score}`);
    return { statusCode: 403, body: "Captcha failed" };
  }

  // Sanitize + validate
  const cleanName  = (name  || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPhone = (phone || "").trim().replace(/\s/g, "");
  const cleanColor = (color || "").trim().slice(0, 50);
  const emailDomain = cleanEmail.split("@")[1];

  if (cleanName.length < 2 || cleanName.length > 100)
    return { statusCode: 400, body: "Invalid name" };
  if (!EMAIL_REGEX.test(cleanEmail) || BLOCKED_DOMAINS.includes(emailDomain))
    return { statusCode: 400, body: "Invalid email" };
  if (!PHONE_REGEX.test(cleanPhone))
    return { statusCode: 400, body: "Invalid phone number" };

  // Google Sheets auth
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  } catch {
    return { statusCode: 500, body: "Server configuration error" };
  }

  const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ["https://www.googleapis.com/auth/spreadsheets"]
  );
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_ID;

  // Duplicate check
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Waitlist!B:C",
    });
    const rows = existing.data.values || [];
    const isDuplicate = rows.some(
        ([existingEmail, existingPhone]) =>
            existingEmail?.toLowerCase() === cleanEmail ||
            existingPhone?.replace(/\s/g, "") === cleanPhone
    );
    if (isDuplicate) {
      console.info(`[DUPLICATE] ${cleanEmail}`);
      return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    }
  } catch (err) {
    console.error(`[DEDUP_ERROR] ${err.message}`);
  }

  // Write to sheet
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Waitlist!A1:F1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[cleanName, cleanEmail, cleanPhone, cleanColor, new Date().toISOString(), ip]],
      },
    });
  } catch (error) {
    console.error(`[SHEET_WRITE_ERROR] ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to write to sheet" }) };
  }

  const signupTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // ── Notify you ────────────────────────────────────────────────────────
  sendEmail({
    to: "theritualcoofficial@gmail.com", // ← your email
    subject: `🛎 New waitlist signup — ${cleanName}`,
    html: `
<h2 style="font-family:sans-serif">New Waitlist Signup</h2>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
  <tr><td style="padding:6px 20px 6px 0;color:#888">Name</td><td><strong>${cleanName}</strong></td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Email</td><td>${cleanEmail}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Phone</td><td>${cleanPhone}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Colour pref</td><td>${cleanColor || "—"}</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">Time</td><td>${signupTime} IST</td></tr>
  <tr><td style="padding:6px 20px 6px 0;color:#888">IP</td><td>${ip}</td></tr>
</table>`,
  }).catch((e) => console.error(`[EMAIL_NOTIFY_ERROR] ${e.message}`));

  // ── Welcome email to user ─────────────────────────────────────────────
  sendEmail({
    to: cleanEmail,
    subject: "You're on the list — The Ritual Co.",
    html: `
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#3a3330;padding:40px 24px;">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>
  <h1 style="font-size:24px;font-weight:400;margin:0 0 8px;">You're on the list.</h1>
  <p style="font-size:15px;color:#7a6f68;line-height:1.7;margin:0 0 24px;">
    Hi ${cleanName}, you've secured early access to our upcoming drop.
    We'll reach out as soon as your spot is ready — with early bird pricing locked in.
  </p>
  <p style="font-size:15px;color:#7a6f68;line-height:1.7;margin:0 0 32px;">
    Follow us on <a href="https://instagram.com/theritualco.in" style="color:#3a3330;">Instagram</a>
    for behind-the-scenes updates.
  </p>
  <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0;">
  <p style="font-size:13px;color:#a09890;margin:0 0 8px;">— Gitika & the Ritual Co. team</p>
  <p style="font-size:11px;color:#c0b8b0;margin:0;">
    <a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a> &nbsp;·&nbsp;
    <a href="mailto:theritualcoofficial@gmail.com?subject=Unsubscribe" style="color:#c0b8b0;">Unsubscribe</a>
  </p>
</div>`,
  }).catch((e) => console.error(`[EMAIL_WELCOME_ERROR] ${e.message}`));

  console.info(`[SUCCESS] ${cleanName} | ${cleanEmail} | ${ip}`);
  return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
};