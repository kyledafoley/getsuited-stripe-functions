const axios = require("axios");
const twilio = require("twilio");

// ------------------------------
// ENVIRONMENT VARIABLES
// ------------------------------
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID,
  ADALO_API_KEY,
  ADALO_APP_ID,
  ADALO_ORDERS_COLLECTION_ID,
} = process.env;

// ------------------------------
// ADALO COLLECTION ENDPOINTS
// ------------------------------

// ✅ Users collection URL (fixed app & collection IDs)
const ADALO_USERS_URL =
  "https://api.adalo.com/v0/apps/898312b7-dedb-4c84-ab75-ae6c32c75e9f/collections/t_461e515419f448d18b49ff1958235f04";

// ✅ Orders collection URL (from env vars)
const ADALO_ORDERS_URL = `https://api.adalo.com/v0/apps/${ADALO_APP_ID}/collections/${ADALO_ORDERS_COLLECTION_ID}`;

// ------------------------------
// TWILIO CLIENT
// ------------------------------
let twilioClient = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

// ------------------------------
// DATE HELPERS
// ------------------------------
function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isToday(dateString) {
  if (!dateString) return false;
  return startOfDay(new Date(dateString)).getTime() === startOfDay().getTime();
}

// ------------------------------
// MAIN HANDLER
// ------------------------------
exports.handler = async () => {
  try {
    // ------------------------------
    // 1. FETCH USERS
    // ------------------------------
    let usersResponse;
    try {
      usersResponse = await axios.get(ADALO_USERS_URL, {
        headers: {
          Authorization: `Bearer ${ADALO_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      console.error("Adalo Users fetch failed:", err.response?.status, e
