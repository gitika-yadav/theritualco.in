const { google } = require("googleapis");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid request" };
  }

  const { name, email, phone, color, nickname, "g-recaptcha-response": token } = data;

  // 1. Honeypot — if filled, silently reject
  if (nickname) {
    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
  }

  // 2. Verify reCAPTCHA server-side (THE MAIN FIX)
  if (!token) {
    return { statusCode: 403, body: "Missing captcha" };
  }

  const recaptchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`,
  });
  const recaptchaData = await recaptchaRes.json();

  if (!recaptchaData.success) {
    return { statusCode: 403, body: "Captcha failed" };
  }

  // 3. Validate inputs
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[6-9]\d{9}$/;
  const blockedDomains = ["test.com", "example.com", "mailinator.com", "guerrillamail.com", "yopmail.com"];

  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    return { statusCode: 400, body: "Invalid name" };
  }
  if (!emailRegex.test(email) || blockedDomains.includes(email.split("@")[1])) {
    return { statusCode: 400, body: "Invalid email" };
  }
  if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
    return { statusCode: 400, body: "Invalid phone" };
  }

  // 4. Write to sheet
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
  const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ["https://www.googleapis.com/auth/spreadsheets"]
  );

  const sheets = google.sheets({ version: "v4", auth });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Waitlist!A1:F1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name.trim(), email.trim(), phone.trim(), color || "", new Date().toISOString()]],
      },
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
  } catch (error) {
    console.error("Sheet error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to write to sheet" }) };
  }
};