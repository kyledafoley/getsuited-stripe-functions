const axios = require("axios");
const twilioLib = require("twilio");

// ------------------------------
// ENV VARS
// ------------------------------

const {
  ADALO_APP_ID,
  ADALO_ORDERS_COLLECTION_ID,
  ADALO_USERS_COLLECTION_ID,
  ADALO_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID,
} = process.env;

const ADALO_ORDERS_URL = `https://api.adalo.com/v0/apps/${ADALO_APP_ID}/collections/${ADALO_ORDERS_COLLECTION_ID}`;
const ADALO_USERS_URL = `https://api.adalo.com/v0/apps/${ADALO_APP_ID}/collections/${ADALO_USERS_COLLECTION_ID}`;

const twilio = twilioLib(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ------------------------------
// HELPERS
// ------------------------------

// Today as "YYYY-MM-DD"
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Convert ISO datetime string → "YYYY-MM-DD"
function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Normalize phone to something Twilio likes
function normalizePhone(phone) {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (trimmed.startsWith("+")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`; // assume US 10-digit
  return trimmed;
}

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async (event) => {
  console.log("📨 send-sms-reminders INVOKED");
  console.log("ADALO_ORDERS_URL:", ADALO_ORDERS_URL);
  console.log("ADALO_USERS_URL:", ADALO_USERS_URL);

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    // Basic config checks
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

    if (!ADALO_USERS_COLLECTION_ID) {
      console.error("Missing ADALO_USERS_COLLECTION_ID");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing ADALO_USERS_COLLECTION_ID" }),
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
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Twilio configuration" }),
      };
    }

    // 1) Fetch orders + users in parallel
    const [orders, users] = await Promise.all([
      fetchOrders(),
      fetchUsers(),
    ]);

    console.log(`Fetched ${orders.length} orders and ${users.length} users`);

    // 2) Build user map: id -> { phone, smsOptIn }
    const userMap = {};
    for (const u of users) {
      userMap[u.id] = {
        phone: u["Mobile Number"] || u.phone,
        smsOptIn: u.sms_opt_in === true || u.sms_opt_in === "true",
      };
    }

    const today = getTodayDate();
    console.log("Today is:", today);

    let pickupCount = 0;
    let returnCount = 0;

    // 3) Iterate orders
    for (const order of orders) {
      // Renter is an array of ids, e.g. "Renter":[274]
      const renterArr = order.Renter;
      const renterId =
        Array.isArray(renterArr) && renterArr.length > 0 ? renterArr[0] : null;

      const userInfo = renterId ? userMap[renterId] : null;
      const rawPhone = userInfo ? userInfo.phone : null;
      const smsOptIn = userInfo ? userInfo.smsOptIn : false;

      const phone = normalizePhone(rawPhone);

      console.log("Order", order.id, {
        renterId,
        rawPhone,
        normalizedPhone: phone,
        smsOptIn,
      });

      // Skip if no phone or not opted in
      if (!phone || !smsOptIn) continue;

      // Real Adalo date fields from your Orders data
      const pickupRaw =
        order["Item Pick Up Date"] ||
        order.pickup_date ||
        order.pickupDate;

      const returnRaw =
        order["Return Due Date"] ||
        order.return_date ||
        order.returnDate;

      const pickupDate = toDateOnly(pickupRaw);
      const returnDate = toDateOnly(returnRaw);

      console.log("Dates for order", order.id, {
        pickupRaw,
        pickupDate,
        returnRaw,
        returnDate,
      });

      // PICKUP reminder: pickup today + no previous pickup_sms_sent_at
      if (pickupDate === today && !order.pickup_sms_sent_at) {
        console.log("Sending PICKUP reminder for order:", order.id);

        await sendSMS(
          phone,
          "Reminder: Your suit pickup is scheduled for today!"
        );

        await updateOrder(order.id, {
          pickup_sms_sent_at: new Date().toISOString(),
        });

        pickupCount++;
      }

      // RETURN reminder: return today + no previous return_sms_sent_at
      if (returnDate === today && !order.return_sms_sent_at) {
        console.log("Sending RETURN reminder for order:", order.id);

        await sendSMS(
          phone,
          "Reminder: Your suit return is due today. Thank you for using GetSuited!"
        );

        await updateOrder(order.id, {
          return_sms_sent_at: new Date().toISOString(),
        });

        returnCount++;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "SMS reminders processed",
        pickupRemindersSent: pickupCount,
        returnRemindersSent: returnCount,
      }),
    };
  } catch (err) {
    console.error("❌ Handler error:", err.response?.data || err.message || err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// ------------------------------
// FETCH HELPERS
// ------------------------------

async function fetchOrders() {
  try {
    console.log("Fetching Orders from:", ADALO_ORDERS_URL);
    const response = await axios.get(ADALO_ORDERS_URL, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Orders status:", response.status);
    return response.data.records || [];
  } catch (err) {
    console.error("❌ Orders fetch error:", err.response?.data || err);
    throw new Error(
      `Adalo Orders fetch failed: ${err.response?.status || "unknown"}`
    );
  }
}

async function fetchUsers() {
  try {
    console.log("Fetching Users from:", ADALO_USERS_URL);
    const response = await axios.get(ADALO_USERS_URL, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Users status:", response.status);
    return response.data.records || [];
  } catch (err) {
    console.error("❌ Users fetch error:", err.response?.data || err);
    throw new Error(
      `Adalo Users fetch failed: ${err.response?.status || "unknown"}`
    );
  }
}

// ------------------------------
// UPDATE + SMS HELPERS
// ------------------------------

async function updateOrder(orderId, fields) {
  try {
    const url = `${ADALO_ORDERS_URL}/${orderId}`;
    await axios.patch(url, fields, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log("Updated order", orderId, fields);
  } catch (err) {
    console.error("❌ Update error:", err.response?.data || err);
  }
}

async function sendSMS(to, body) {
  try {
    await twilio.messages.create({
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      to,
      body,
    });
    console.log("📲 SMS sent:", to);
  } catch (err) {
    console.error("❌ SMS error:", err);
  }
}
