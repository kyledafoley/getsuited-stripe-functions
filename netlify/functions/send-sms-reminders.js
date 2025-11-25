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

// Helper: convert Adalo ISO dates to YYYY-MM-DD
function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
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
  console.log("📨 send-sms-reminders INVOKED");
  console.log("ADALO_ORDERS_URL:", ADALO_ORDERS_URL);

  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    if (!ADALO_APP_ID || !ADALO_ORDERS_COLLECTION_ID || !ADALO_API_KEY) {
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
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Twilio configuration" }),
      };
    }

    const orders = await fetchOrders();
    console.log(`Fetched ${orders.length} orders`);

    const today = getTodayDate();
    let pickupCount = 0;
    let returnCount = 0;

    for (const order of orders) {
      const user = order.user || {};
      const phone = user.phone;
      const smsOptIn = user.sms_opt_in === true || user.sms_opt_in === "true";

      if (!phone || !smsOptIn) continue;

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

      console.log(`Order ${order.id}`, {
        pickupDate,
        returnDate,
      });

      // Pickup reminder
      if (pickupDate === today && !order.pickup_sms_sent_at) {
        await sendSMS(phone, "Reminder: Your suit pickup is scheduled for today!");
        await updateOrder(order.id, {
          pickup_sms_sent_at: new Date().toISOString(),
        });
        pickupCount++;
      }

      // Return reminder
      if (returnDate === today && !order.return_sms_sent_at) {
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
    console.error("❌ Handler error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// ------------------------------
// HELPERS
// ------------------------------

async function fetchOrders() {
  try {
    const response = await axios.get(ADALO_ORDERS_URL, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    return response.data.records || [];
  } catch (err) {
    console.error("❌ Fetch error:", err.response?.data || err);
    throw new Error(
      `Adalo Orders fetch failed: ${err.response?.status}`
    );
  }
}

async function updateOrder(orderId, fields) {
  try {
    const url = `${ADALO_ORDERS_URL}/${orderId}`;
    await axios.patch(url, fields, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
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
