import fetch from 'node-fetch';

export async function handler(event) {
  try {
    const data = JSON.parse(event.body);
    const { name, email, phone, color, nickname, "g-recaptcha-response": captcha } = data;

    // Anti-spam honeypot
    if (nickname && nickname.trim() !== "") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Bot detected" })
      };
    }

    // reCAPTCHA verification
    const secret = "6Lc6HkwrAAAAAGa3fFtep-hx25MqyAfVK-zxnuh2";
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${captcha}`;

    const captchaRes = await fetch(verifyURL, { method: "POST" });
    const captchaJson = await captchaRes.json();

    if (!captchaJson.success) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Captcha verification failed" })
      };
    }

    // Do something with the data (store/log/forward to Formspree etc.)
    console.log("Valid form submission:", { name, email, phone, color });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Form submitted!" })
    };
  } catch (err) {
    console.error("FULL ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message })
    };
  }
}

