const { google } = require("googleapis");

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const data = JSON.parse(event.body);
  const { name, email, phone, color } = data;

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = process.env.SHEET_ID;
  const range = "Sheet1!A1:E1"; // Update to cover all 5 columns

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, email, phone, color, new Date().toISOString()]],
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    console.error("Error writing to sheet:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to write to sheet" }),
    };
  }
};
