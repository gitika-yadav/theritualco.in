const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const RECAPTCHA_SECRET = "YOUR_RECAPTCHA_SECRET_KEY"; // 🔁 Replace with your actual secret key

  // Get IP and headers
  const ip = event.headers["x-forwarded-for"] || "unknown";
  const userAgent = event.headers["user-agent"];

  // Parse form data
  let formData;
  try {
    formData = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // 🛡️ Honeypot field check (used to catch bots)
  if (formData.nickname && formData.nickname.trim() !== "") {
    return { statusCode: 403, body: "Spam detected (honeypot)" };
  }

  // 🧠 Verify reCAPTCHA token
  const recaptchaToken = formData["g-recaptcha-response"];
  if (!recaptchaToken) {
    return { statusCode: 400, body: "Missing reCAPTCHA token" };
  }

  const verifyURL = `https://www.google.com/recaptcha/api/siteverify`;
  const params = new URLSearchParams();
  params.append("secret", RECAPTCHA_SECRET);
  params.append("response", recaptchaToken);

  const recaptchaRes = await fetch(verifyURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const recaptchaJson = await recaptchaRes.json();
  if (!recaptchaJson.success) {
    return { statusCode: 403, body: "Failed reCAPTCHA verification" };
  }

  // 🔗 Forward valid submission to Formspree
  const FORMSPREE_ENDPOINT = "https://formspree.io/f/xpwdgbdv"; // 🔁 Replace with your actual Formspree endpoint

  const response = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData)
  });

  if (!response.ok) {
    return {
      statusCode: response.status,
      body: "Error forwarding to Formspree"
    };
  }

  // ✅ Success
  console.log("New submission from IP:", ip);
  console.log("User-Agent:", userAgent);
  console.log("Form data:", formData);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, message: "Form submitted successfully" })
  };
};

