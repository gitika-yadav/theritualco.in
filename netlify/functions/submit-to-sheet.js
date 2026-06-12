const { google } = require("googleapis");

// In-memory rate limiter (resets on function cold start, good enough for Netlify)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3; // max submissions per IP per minute

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

exports.handler = async function (event) {
  // Method check
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Rate limit by IP
  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    console.warn(`[RATE_LIMIT] IP: ${ip}`);
    return { statusCode: 429, body: "Too many requests. Please wait a moment." };
  }

  // Parse body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    console.warn(`[BAD_JSON] IP: ${ip}`);
    return { statusCode: 400, body: "Invalid request" };
  }

  const {
    name,
    email,
    phone,
    color,
    nickname,
    "g-recaptcha-response": token,
  } = data;

  // Honeypot — silent reject
  if (nickname) {
    console.warn(`[HONEYPOT] IP: ${ip}, email: ${email}`);
    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
  }

  // reCAPTCHA — must be present
  if (!token) {
    console.warn(`[NO_CAPTCHA] IP: ${ip}`);
    return { statusCode: 403, body: "Missing captcha" };
  }

  // reCAPTCHA — verify with Google
  let recaptchaData;
  try {
    const recaptchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}&remoteip=${ip}`,
    });
    recaptchaData = await recaptchaRes.json();
  } catch (err) {
    console.error(`[CAPTCHA_FETCH_ERROR] ${err.message}`);
    return { statusCode: 500, body: "Captcha verification failed" };
  }

  if (!recaptchaData.success) {
    console.warn(`[CAPTCHA_FAIL] IP: ${ip}, errors: ${recaptchaData["error-codes"]}`);
    return { statusCode: 403, body: "Captcha failed" };
  }

  // Sanitize inputs
  const cleanName  = (name  || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPhone = (phone || "").trim().replace(/\s/g, "");
  const cleanColor = (color || "").trim().slice(0, 50);

  // Validate name
  if (cleanName.length < 2 || cleanName.length > 100) {
    return { statusCode: 400, body: "Invalid name" };
  }

  // Validate email + blocked domains
  const emailDomain = cleanEmail.split("@")[1];
  if (!EMAIL_REGEX.test(cleanEmail) || BLOCKED_DOMAINS.includes(emailDomain)) {
    console.warn(`[INVALID_EMAIL] IP: ${ip}, email: ${cleanEmail}`);
    return { statusCode: 400, body: "Invalid email" };
  }

  // Validate Indian mobile number
  if (!PHONE_REGEX.test(cleanPhone)) {
    return { statusCode: 400, body: "Invalid phone number" };
  }

  // Google Sheets auth
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  } catch {
    console.error("[BAD_CREDENTIALS] Could not parse GOOGLE_SERVICE_ACCOUNT");
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

  // Duplicate check — read existing emails + phones
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Waitlist!B:C", // email column B, phone column C
    });

    const rows = existing.data.values || [];
    const isDuplicate = rows.some(
        ([existingEmail, existingPhone]) =>
            existingEmail?.toLowerCase() === cleanEmail ||
            existingPhone?.replace(/\s/g, "") === cleanPhone
    );

    if (isDuplicate) {
      console.info(`[DUPLICATE] email: ${cleanEmail}, phone: ${cleanPhone}`);
      // Return success so user isn't confused, but don't write
      return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    }
  } catch (err) {
    console.error(`[DEDUP_ERROR] ${err.message}`);
    // Non-fatal — proceed with write if dedup check fails
  }

  // Write to sheet
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Waitlist!A1:F1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          cleanName,
          cleanEmail,
          cleanPhone,
          cleanColor,
          new Date().toISOString(),
          ip, // log IP for future abuse tracking
        ]],
      },
    });

    console.info(`[SUCCESS] name: ${cleanName}, email: ${cleanEmail}, ip: ${ip}`);
    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };

  } catch (error) {
    console.error(`[SHEET_WRITE_ERROR] ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to write to sheet" }) };
  }
};