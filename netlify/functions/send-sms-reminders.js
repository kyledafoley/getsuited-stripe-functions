const axios = require("axios");
const twilioLib = require("twilio");

// ------------------------------
// ENV VARS
// ------------------------------

const {
  ADALO_APP_ID,
  ADALO_ORDERS_COLLECTION_ID,
  ADALO_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID,
} = process.env;

const ADALO_ORDERS_URL = `https://api.adalo.com/v0/apps/${ADALO_APP_ID}/collections/${ADALO_ORDERS_COLLECTION_ID}`;

const twilio = twilioLib(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Helper: get today's date as "YYYY-MM-DD"
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: normalize any Adalo date field to "YYYY-MM-DD"
function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") {
    // Adalo sends ISO strings like 2025-11-25T05:00:00.000Z
    return value.slice(0, 10);
  }
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async (event) => {
  console.log("📨 send-sms-reminders INVOKED. Method:", event.httpMethod);
  console.log("ADALO_ORDERS_URL:", ADALO_ORDERS_URL);

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    if (!ADALO_APP_ID || !ADALO_ORDERS_COLLECTION_ID || !ADALO_API_KEY) {
      console.error("Missing Adalo env vars", {
        hasAppId: !!ADALO_APP_ID,
        hasOrdersId: !!ADALO_ORDERS_COLLECTION_ID,
        hasApiKey: !!ADALO_API_KEY,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Adalo configuration" }),
      };
    }

    if (
      !TWILIO_ACCOUNT_SID ||
      !TWILIO_AUTH_TOKEN ||
      !TWILIO_MESSAGING_SERVICE_SID
    ) {
      console.error("Missing Twilio env vars", {
        hasSid: !!TWILIO_ACCOUNT_SID,
        hasToken: !!TWILIO_AUTH_TOKEN,
        hasMsgSid: !!TWILIO_MESSAGING_SERVICE_SID,
      });
      return {
