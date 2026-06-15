const { google } = require("googleapis");

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

function buildLaunchEmail(firstName) {
    return `
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;color:#3a3330;background:#fff;">

  <!-- Header -->
  <div style="padding:32px 32px 0;border-bottom:1px solid #e8e2dc;">
    <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 24px;">The Ritual Co.</p>
  </div>

  <!-- Hero -->
  <div style="padding:40px 32px 32px;border-bottom:1px solid #e8e2dc;">
    <p style="font-size:13px;color:#a09890;margin:0 0 12px;letter-spacing:.04em;">We launched.</p>
    <h1 style="font-size:32px;font-weight:400;line-height:1.25;margin:0 0 20px;color:#1a1714;">
      The wait is over,<br/>${firstName}.
    </h1>
    <p style="font-size:16px;color:#7a6f68;line-height:1.8;margin:0 0 16px;">
      You signed up early — so you hear it first. The Ritual Co. is officially live, and both products are ready to order today.
    </p>
    <p style="font-size:16px;color:#7a6f68;line-height:1.8;margin:0;">
      Early bird pricing is available for the <strong style="color:#3a3330;">first 100 customers only.</strong> Once those spots are gone, prices go back to regular.
    </p>
  </div>

  <!-- Product 1: Capsule Dumbbells -->
  <div style="padding:40px 32px 32px;border-bottom:1px solid #e8e2dc;">
    <p style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a09890;margin:0 0 12px;">Signature Product</p>
    <h2 style="font-size:22px;font-weight:400;margin:0 0 8px;color:#1a1714;">Capsule Silicone Dumbbells</h2>
    <p style="font-size:14px;color:#a09890;margin:0 0 20px;font-style:italic;">Soft, strong, and unapologetically minimal.</p>

    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 20px;">
      Cast-iron core wrapped in skin-safe, silk-matte silicone. Designed specifically for women's hands with an ergonomic ~35mm grip — balanced weight distribution so there's no wrist roll mid-rep. Available in Peach, Grey, Cream, Black, and Pink.
    </p>

    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 20px;">
      These are the rare dumbbells you won't want to hide in a cupboard. Perfect for morning toning, Pilates, barre, mobility work, and desk-break resets.
    </p>

    <!-- Pricing table -->
    <div style="background:#f9f6f2;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#888;">1 kg set</td>
          <td style="text-align:right;">
            <span style="text-decoration:line-through;color:#c0b8b0;margin-right:8px;">₹1,999</span>
            <strong style="color:#1a1714;">₹1,499</strong>
            <span style="font-size:11px;color:#a09890;margin-left:6px;">early bird</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">2 kg set</td>
          <td style="text-align:right;">
            <span style="text-decoration:line-through;color:#c0b8b0;margin-right:8px;">₹2,499</span>
            <strong style="color:#1a1714;">₹1,999</strong>
            <span style="font-size:11px;color:#a09890;margin-left:6px;">early bird</span>
          </td>
        </tr>
      </table>
    </div>

    <a href="https://theritualco.in/products/capsule-dumbbell"
       style="display:inline-block;background:#3a3330;color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:13px;letter-spacing:.06em;">
      Shop Capsule Dumbbells
    </a>
  </div>

  <!-- Product 2: Yoga Belt -->
  <div style="padding:40px 32px 32px;border-bottom:1px solid #e8e2dc;">
    <p style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a09890;margin:0 0 12px;">Also New</p>
    <h2 style="font-size:22px;font-weight:400;margin:0 0 8px;color:#1a1714;">Yoga Belt</h2>
    <p style="font-size:14px;color:#a09890;margin:0 0 20px;font-style:italic;">Stretch deeper. Move with intention.</p>

    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 20px;">
      100% organically sourced cotton, 96 inches long, with an adjustable metal D-ring buckle that holds any pose. The extra-wide 1.5" strap distributes pressure evenly — woven tight enough to hold, soft enough to touch skin.
    </p>

    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 20px;">
      Use it for hamstring stretches, shoulder openers, hip flexor release, seated forward folds, or any pose where your hands can't yet meet. Equally at home in a morning Yin session or a physio routine. Currently available in Ivory.
    </p>

    <!-- Pricing -->
    <div style="background:#f9f6f2;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#888;">Yoga Belt</td>
          <td style="text-align:right;">
            <span style="text-decoration:line-through;color:#c0b8b0;margin-right:8px;">₹499</span>
            <strong style="color:#1a1714;">₹399</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#a09890;" colspan="2">Free shipping on orders above ₹999</td>
        </tr>
      </table>
    </div>

    <a href="https://theritualco.in/products/yoga-belt"
       style="display:inline-block;background:#3a3330;color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-size:13px;letter-spacing:.06em;">
      Shop Yoga Belt
    </a>
  </div>

  <!-- Bundle nudge -->
  <div style="padding:32px;background:#f9f6f2;border-bottom:1px solid #e8e2dc;">
    <p style="font-size:14px;color:#3a3330;margin:0 0 8px;font-weight:500;">Tip — order both and hit ₹999 for free shipping.</p>
    <p style="font-size:13px;color:#7a6f68;margin:0 0 16px;">
      A 1kg dumbbell set (₹1,499) + Yoga Belt (₹399) = ₹1,898 with free pan-India delivery. A complete ritual, delivered to your door.
    </p>
    <a href="https://theritualco.in/products/products"
       style="font-size:13px;color:#3a3330;letter-spacing:.04em;">
      Browse all products →
    </a>
  </div>

  <!-- Closing -->
  <div style="padding:40px 32px;">
    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 16px;">
      Thank you for believing in this before it existed. We built it for you — for the person who wants movement to feel like a ritual, not a chore.
    </p>
    <p style="font-size:15px;color:#7a6f68;line-height:1.8;margin:0 0 32px;">
      Can't wait for you to have these.
    </p>
    <p style="font-size:14px;color:#a09890;margin:0;">— Gitika & the Ritual Co. team</p>

    <hr style="border:none;border-top:1px solid #e8e2dc;margin:32px 0 24px;">
    <p style="font-size:11px;color:#c0b8b0;margin:0;line-height:1.8;">
      You're receiving this because you signed up for early access at
      <a href="https://theritualco.in" style="color:#c0b8b0;">theritualco.in</a>.<br/>
      <a href="mailto:theritualcoofficial@gmail.com?subject=Unsubscribe" style="color:#c0b8b0;">Unsubscribe</a>
    </p>
  </div>

</div>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Protect endpoint
    if (event.headers["x-newsletter-secret"] !== process.env.NEWSLETTER_SECRET) {
        console.warn("[UNAUTHORIZED] Newsletter endpoint hit without valid secret");
        return { statusCode: 401, body: "Unauthorized" };
    }

    // Fetch waitlist from Google Sheet
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

    // If custom_emails provided, use those instead of full waitlist
    let rows;
    const { custom_emails } = JSON.parse(event.body);

    if (custom_emails && custom_emails.length > 0) {
        // custom_emails is array of "Name <email>" or just "email"
        rows = custom_emails.map(entry => {
            const match = entry.match(/^(.+?)\s*<(.+?)>$/);
            if (match) return [match[1].trim(), match[2].trim()];
            return ["there", entry.trim()];
        });
        console.info(`[CUSTOM_SEND] Sending to ${rows.length} custom recipients`);
    } else {
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: process.env.SHEET_ID,
                range: "Waitlist!A:B",
            });
            rows = res.data.values || [];
        } catch (err) {
            console.error(`[SHEET_READ_ERROR] ${err.message}`);
            return { statusCode: 500, body: "Failed to read waitlist" };
        }
    }

    if (rows.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ sent: 0, message: "No recipients" }) };
    }

    let sent = 0;
    let failed = 0;
    const failures = [];

    for (const [name, email] of rows) {
        if (!email || !email.includes("@")) continue;

        const firstName = (name || "").split(" ")[0] || "there";

        try {
            await sendEmail({
                to: email,
                subject: "We launched — and you're first in line ✦",
                html: buildLaunchEmail(firstName),
            });
            sent++;
            console.info(`[SENT] ${email}`);
        } catch (err) {
            failed++;
            failures.push(email);
            console.error(`[FAILED] ${email}: ${err.message}`);
        }

        // 200ms delay between sends to stay within Resend rate limits
        await new Promise((r) => setTimeout(r, 1000));
    }

    console.info(`[NEWSLETTER_DONE] sent: ${sent}, failed: ${failed}`);
    return {
        statusCode: 200,
        body: JSON.stringify({ sent, failed, failures }),
    };
};