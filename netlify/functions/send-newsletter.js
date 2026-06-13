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
            reply_to: "theritualcoofficial@gmail.com",
            to,
            subject,
            html,
        }),
    });
    if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
    return res.json();
}

// ─── Handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Protect this endpoint — only you can call it
    const authHeader = event.headers["x-newsletter-secret"];
    if (authHeader !== process.env.NEWSLETTER_SECRET) {
        console.warn("[UNAUTHORIZED] Newsletter endpoint called without valid secret");
        return { statusCode: 401, body: "Unauthorized" };
    }

    // Parse campaign from request body
    let campaign;
    try {
        campaign = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: "Invalid JSON" };
    }

    const { subject, preheader, headline, body, cta_text, cta_url } = campaign;

    if (!subject || !headline || !body || !cta_text || !cta_url) {
        return { statusCode: 400, body: "Missing required fields: subject, headline, body, cta_text, cta_url" };
    }

    // ── Fetch all waitlist emails from Google Sheet ──────────────────────
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

    let rows;
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: "Waitlist!A:C", // name (A), email (B), phone (C)
        });
        rows = res.data.values || [];
    } catch (err) {
        console.error(`[SHEET_READ_ERROR] ${err.message}`);
        return { statusCode: 500, body: "Failed to read waitlist" };
    }

    if (rows.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ sent: 0, message: "No subscribers" }) };
    }

    // ── Send emails with 200ms delay to avoid rate limits ───────────────
    let sent = 0;
    let failed = 0;
    const failures = [];

    for (const [name, email] of rows) {
        if (!email || !email.includes("@")) continue;

        const firstName = (name || "").split(" ")[0] || "there";

        const html = `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#3a3330;padding:40px 24px;">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 32px;">The Ritual Co.</p>

  ${preheader ? `<p style="font-size:13px;color:#a09890;margin:0 0 16px;">${preheader}</p>` : ""}

  <h1 style="font-size:26px;font-weight:400;line-height:1.3;margin:0 0 16px;">${headline}</h1>

  <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 8px;">Hi ${firstName},</p>

  <div style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 32px;">
    ${body.replace(/\n/g, "<br/>")}
  </div>

  <a href="${cta_url}" style="display:inline-block;background:#3a3330;color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:14px;letter-spacing:.05em;">
    ${cta_text}
  </a>

  <hr style="border:none;border-top:1px solid #e8e2dc;margin:40px 0 24px;">

  <p style="font-size:11px;color:#c0b8b0;margin:0;line-height:1.7;">
    You're receiving this because you signed up for early access at
    <a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a>.<br/>
    <a href="mailto:theritualcoofficial@gmail.com?subject=Unsubscribe&body=Please unsubscribe ${email}" style="color:#c0b8b0;">Unsubscribe</a>
  </p>
</div>`;

        try {
            await sendEmail({ to: email, subject, html });
            sent++;
            console.info(`[SENT] ${email}`);
        } catch (err) {
            failed++;
            failures.push(email);
            console.error(`[FAILED] ${email}: ${err.message}`);
        }

        // 200ms delay between sends to stay within Resend rate limits
        await new Promise((r) => setTimeout(r, 200));
    }

    console.info(`[NEWSLETTER_DONE] sent: ${sent}, failed: ${failed}`);

    return {
        statusCode: 200,
        body: JSON.stringify({ sent, failed, failures }),
    };
};