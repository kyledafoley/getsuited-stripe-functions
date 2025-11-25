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

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async (event) => {
  console.log("📨 send-sms-reminders INVOKED. Method:", event.httpMethod);
  console.log("Using ADALO_ORDERS_URL:", ADALO_ORDERS_URL);

  try {
    // Allow GET for easy browser testing
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    // Basic sanity check on env vars
    if (!ADALO_APP_ID || !ADALO_ORDERS_COLLECTION_ID || !ADALO_API_KEY) {
      console.error("Missing Adalo env vars");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Adalo configuration" }),
      };
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGING_SERVICE_SID) {
      console.error("Missing Twilio env vars");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing Twilio configuration" }),
      };
    }

    // 1) Fetch orders from Adalo
    const orders = await fetchOrders();
    console.log(`Fetched ${orders.length} orders from Adalo.`);

    const today = getTodayDate();
    console.log("Today is:", today);

    let pickupCount = 0;
    let returnCount = 0;

    for (const order of orders) {
      // Adjust these to match your actual field names in Adalo:
      const user = order.user || order.User || {}; // safety: check both user/User
      const phone = user.phone;
      const smsOptIn = user.sms_opt_in;

      if (!phone || !smsOptIn) {
        continue;
      }

      const pickupDate = order.pickup_date;
      const returnDate = order.return_date;

      // ------------------------------
      // PICKUP REMINDER
      // ------------------------------
      if (pickupDate === today && !order.pickup_sms_sent_at) {
        console.log("Sending pickup reminder for order:", order.id);

        await sendSMS(
          phone,
          "Reminder: Your suit pickup is scheduled for today!"
        );

        await updateOrder(order.id, {
          pickup_sms_sent_at: new Date().toISOString(),
        });

        pickupCount++;
      }

      // ------------------------------
      // RETURN REMINDER
      // ------------------------------
      if (returnDate === today && !order.return_sms_sent_at) {
        console.log("Sending return reminder for order:", order.id);

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
    console.error("❌ ERROR in handler:", err.response?.data || err.message);
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
    console.log("Fetching orders from:", ADALO_ORDERS_URL);

    const response = await axios.get(ADALO_ORDERS_URL, {
      headers: {
        Authorization: `Bearer ${ADALO_API_KEY}`,
        "Content-Type": "application/json",
      },
      // If you need nested user objects later, we can add query params here
    });

    console.log("Raw Adalo response status:", response.status);
    return response.data.records || [];
  } catch (err) {
    console.error(
      "❌ Adalo Orders fetch failed:",
      err.response?.status,
      err.response?.data
    );
    throw new Error(`Adalo Orders fetch failed: ${err.response?.status}`);
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

    console.log("Updated order:", orderId, fields);
  } catch (err) {
    console.error("❌ Failed to update order:", orderId, err.response?.data);
  }
}

async function sendSMS(to, body) {
  try {
    await twilio.messages.create({
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      to,
      body,
    });

    console.log("📲 SMS sent to", to);
  } catch (err) {
    console.error("❌ Twilio SMS error:", err);
    throw err;
  }
}

