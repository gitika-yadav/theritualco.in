const { google } = require("googleapis");

exports.handler = async () => {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || "{}");
        const auth = new google.auth.JWT(
            credentials.client_email, null, credentials.private_key,
            ["https://www.googleapis.com/auth/spreadsheets"]
        );
        const sheets = google.sheets({ version: "v4", auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: "Waitlist!B:B",
        });
        const rows = (res.data.values || []).filter(r => r[0] && r[0].includes("@"));
        return { statusCode: 200, body: JSON.stringify({ count: rows.length }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ count: 0 }) };
    }
};