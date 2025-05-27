const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

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

  // Log for your own records (optional)
  console.log("New submission from IP:", ip);
  console.log("User-Agent:", userAgent);
  console.log("Form data:", formData);

  // Optional: add honeypot check
  if (formData.nickname && formData.nickname.trim() !== "") {
    return {
      statusCode: 403,
      body: "Spam detected"
    };
  }

  // Send to Formspree
  const response = await fetch("https://formspree.io/f/xpwdgbdv", {
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

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, message: "Form submitted" })
  };
};
