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

// ✅ Correct Users collection URL (yours)
const ADALO_USERS_URL =
  "https://api.adalo.com/v0/apps/898312b7-dedb-4c84-ab75-ae6c32c75e9f/collections/t_461e515419f448d18b49ff1958235f04";

// ✅ Orders collection URL (based on your variables)
const ADALO_ORDERS_URL = `https://api.adalo.com/v0/apps/${ADALO_APP_ID}/collections/${ADALO_ORDERS_COLLECTION_ID}`;

// ------------------------------
// TWILIO
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
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Adalo Users fetch failed: ${err.response?.status || ""} - ${
            err.response?.statusText || ""
          }`,
        }),
      };
    }

    const users = usersResponse.data.records || [];

    // ------------------------------
    // 2. FETCH ORDERS
    // ------------------------------
    let ordersResponse;
    try {
      ordersResponse = await axios.get(ADALO_ORDERS_URL, {
        headers: {
          Authorization: `Bearer ${ADALO_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Adalo Orders fetch failed: ${err.response?.status || ""} - ${
            err.response?.statusText || ""
          }`,
        }),
      };
    }

    const orders = ordersResponse.data.records || [];

    // ------------------------------
    // 3. SETUP COUNTS
    // ------------------------------
    let pickupRemindersSent = 0;
    let returnRemindersSent = 0;

    // ------------------------------
    // 4. LOOP THROUGH ORDERS
    // ------------------------------
    for (const order of orders) {
      const renterID = Array.isArray(order.Renter) ? order.Renter[0] : null;
      const renter = users.find((u) => u.id === renterID);

      if (!renter) continue;
      if (!renter["sms_opt_in"]) continue;
      if (!renter["Mobile Number"]) continue;

      const pickupDate = order["Item Pick Up Date"];
      const returnDate = order["Return Due Date"];

      const pickupAlreadySent = order["pickup_sms_sent_at"];
      const returnAlreadySent = order["return_sms_sent_at"];

      const renterPhone = "+1" + renter["Mobile Number"];

      // ------------------------------
      // PICKUP REMINDER
      // ------------------------------
      if (pickupDate && isToday(pickupDate) && !pickupAlreadySent) {
        if (twilioClient && TWILIO_MESSAGING_SERVICE_SID) {
          try {
            await twilioClient.messages.create({
              messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
              to: renterPhone,
              body: `Reminder: Your GetSuited pickup is today!`,
            });

            pickupRemindersSent++;

            // Update Adalo to mark pickup reminder sent
            await axios.patch(
              `${ADALO_ORDERS_URL}/${order.id}`,
              { pickup_sms_sent_at: new Date().toISOString() },
              {
                headers: {
                  Authorization: `Bearer ${ADALO_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );
          } catch (err) {
            console.log("Pickup SMS failed:", err.message);
          }
        }
      }

      // ------------------------------
      // RETURN REMINDER
      // ------------------------------
      if (returnDate && isToday(returnDate) && !returnAlreadySent) {
        if (twilioClient && TWILIO_MESSAGING_SERVICE_SID) {
          try {
            await twilioClient.messages.create({
              messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
              to: renterPhone,
              body: `Reminder: Your GetSuited return is due today.`,
            });

            returnRemindersSent++;

            // Update return sent
            await axios.patch(
              `${ADALO_ORDERS_URL}/${order.id}`,
              { return_sms_sent_at: new Date().toISOString() },
              {
                headers: {
                  Authorization: `Bearer ${ADALO_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );
          } catch (err) {
            console.log("Return SMS failed:", err.message);
          }
        }
      }
    }

    // ------------------------------
    // END SUCCESS RESPONSE
    // ------------------------------
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "SMS reminders processed",
        pickupRemindersSent,
        returnRemindersSent,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
