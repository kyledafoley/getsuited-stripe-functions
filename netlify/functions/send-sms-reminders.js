const axios = require("axios");
const dayjs = require("dayjs");

// ------------------------------
// CONFIG
// ------------------------------

const ADALO_ORDERS_URL =
  "https://api.adalo.com/v0/apps/898312b7-dedb-4c84-ab75-ae6c32c75e9f/collections/t_94atzmgrrmafbkgcqkpvhttn1";

const ADALO_AUTH = process.env.ADALO_API_KEY;

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID;

const twilio = require("twilio")(TWILIO_SID, TWILIO_AUTH);

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async (event) => {
  console.log("📨 send-sms-reminders INVOKED. Method:", event.httpMethod);

  try {
    // Allow browser GET for testing
    if (event.httpMethod === "GET") {
      console.log("GET request — running full logic for testing.");
    }

    // Fetch all orders from Adalo
    const orders = await fetchOrders();
    console.log(`Fetched ${orders.length} orders from Adalo.`);

    const today = dayjs().format("YYYY-MM-DD");
    console.log("Today is:", today);

    let pickupCount = 0;
    let returnCount = 0;

    for (const order of orders) {
      const user = order.user || {}; // Ensure safety
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
          `Reminder: Your suit pickup is scheduled for today!`
        );

        await updateOrder(order.id, { pickup_sms_sent_at: new Date().toISOString() });
        pickupCount++;
      }

      // ------------------------------
      // RETURN REMINDER
      // ------------------------------

      if (returnDate === today && !order.return_sms_sent_at) {
        console.log("Sending return reminder for order:", order.id);

        await sendSMS(
          phone,
          `Reminder: Your suit return is due today. Thank you for using GetSuited!`
        );

        await updateOrder(order.id, { return_sms_sent_at: new Date().toISOString() });
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
    console.error("❌ ERROR:", err);
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
        Authorization: `Bearer ${ADALO_AUTH}`,
        "Content-Type": "application/json",
      },
    });

    return response.data.records || [];
  } catch (err) {
    console.error("❌ Adalo Orders fetch failed:", err.response?.status, err.response?.data);
    throw new Error(`Adalo Orders fetch failed: ${err.response?.status}`);
  }
}

async function updateOrder(orderId, fields) {
  try {
    const url = `${ADALO_ORDERS_URL}/${orderId}`;

    await axios.patch(
      url,
      fields,
      {
        headers: {
          Authorization: `Bearer ${ADALO_AUTH}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Updated order:", orderId, fields);
  } catch (err) {
    console.error("❌ Failed to update order:", orderId, err.response?.data);
  }
}

async function sendSMS(to, body) {
  try {
    await twilio.messages.create({
      messagingServiceSid: TWILIO_MESSAGING_SERVICE,
      to,
      body,
    });

    console.log("📲 SMS sent to", to);
  } catch (err) {
    console.error("❌ Twilio SMS error:", err);
    throw err;
  }
}
