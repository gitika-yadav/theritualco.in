const fetch = require("node-fetch");
const querystring = require("querystring");

exports.handler = async function (event) {
  try {
    let data;

    // Handle URL-encoded form data (like Formspree sends)
    if (event.headers["content-type"].includes("application/x-www-form-urlencoded")) {
      data = querystring.parse(event.body);
    } else {
      data = JSON.parse(event.body);
    }

    const { name, email, phone, color, nickname, "g-recaptcha-response": captcha } = data;

    // Honeypot anti-spam
    if (nickname && nickname.trim() !== "") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Bot detected" })
      };
    }

    // reCAPTCHA v2 Invisible
    const secret = process.env.RECAPTCHA_SECRET;
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify`;

    const captchaRes = await fetch(verifyURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${secret}&response=${captcha}`
    });

    const captchaJson = await captchaRes.json();

    if (!captchaJson.success) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Captcha verification failed" })
      };
    }

    console.log("✅ Valid form submission:", { name, email, phone, color });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Form submitted successfully!" })
    };
  } catch (err) {
    console.error("❌ Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
