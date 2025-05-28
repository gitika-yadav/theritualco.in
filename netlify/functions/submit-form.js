import fetch from 'node-fetch';

export async function handler(event) {
  try {
    const data = JSON.parse(event.body);
    const { name, email, phone, color, nickname, "g-recaptcha-response": captcha } = data;

    // Honeypot field — basic bot filter
    if (nickname && nickname.trim() !== "") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Bot detected" }),
      };
    }

    // reCAPTCHA verification
    const secret = process.env.RECAPTCHA_SECRET;
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${captcha}`;

    const captchaRes = await fetch(verifyURL, { method: "POST" });
    const captchaJson = await captchaRes.json();

    if (!captchaJson.success) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Captcha verification failed" }),
      };
    }

    // Forwarding to Formspree
    const formspreeURL = "https://formspree.io/f/xpwdgbdv";
    const forwardRes = await fetch(formspreeURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name,
        email,
        phone,
        color,
      }).toString()
    });

    if (!forwardRes.ok) {
      const errorText = await forwardRes.text();
      throw new Error("Formspree error: " + errorText);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Form submitted successfully!" }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}

