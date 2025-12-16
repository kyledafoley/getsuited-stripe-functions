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
      console.error(
        "Adalo Users fetch failed:",
        err.response?.status,
        err.response?.statusText
      );
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
      console.error(
        "Adalo Orders fetch failed:",
        err.response?.status,
        err.response?.statusText
      );
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
      // --- Relationships from Order to Users ---
      const renterID = Array.isArray(order.Renter)
        ? order.Renter[0]
        : order.Renter || null;

      const listerID = Array.isArray(order.Lister)
        ? order.Lister[0]
        : order.Lister || null;

      const renter = renterID ? users.find((u) => u.id === renterID) : null;
      const lister = listerID ? users.find((u) => u.id === listerID) : null;

      // --- Opt-in + phone checks ---
      const renterOptedIn =
        renter && renter["sms_opt_in"] && renter["Mobile Number"];
      const listerOptedIn =
        lister && lister["sms_opt_in"] && lister["Mobile Number"];

      const renterPhone =
        renterOptedIn && renter["Mobile Number"]
          ? "+1" + renter["Mobile Number"]
          : null;

      const listerPhone =
        listerOptedIn && lister["Mobile Number"]
          ? "+1" + lister["Mobile Number"]
          : null;

      // If nobody for this order has opted in or has a phone, skip
      if (!renterOptedIn && !listerOptedIn) continue;

      // --- Order date & flags ---
      const pickupDate = order["Item Pick Up Date"];
      const returnDate = order["Return Due Date"];

      const pickupAlreadySent = order["pickup_sms_sent_at"];
      const returnAlreadySent = order["return_sms_sent_at"];

      // ------------------------------
      // PICKUP REMINDER (Renter + Lister)
      // ------------------------------
      if (pickupDate && isToday(pickupDate) && !pickupAlreadySent) {
        if (twilioClient && TWILIO_MESSAGING_SERVICE_SID) {
          try {
            // Renter pickup reminder
            if (renterPhone) {
              await twilioClient.messages.create({
                messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
                to: renterPhone,
                body: `GetSuited: Pickup is scheduled for today. Once you’ve received the item, please mark it as Picked Up in your order page.`,
              });
            }

            // Lister pickup reminder
            if (listerPhone) {
              await twilioClient.messages.create({
                messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
                to: listerPhone,
                body: `GetSuited: A renter is scheduled to pick up an item today. Once the handoff is complete, please mark the order as Picked Up in your order page.`,
              });
            }

            pickupRemindersSent++;

            // Mark pickup reminder as sent for this order
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
      // RETURN REMINDER (Renter + Lister)
      // ------------------------------
      if (returnDate && isToday(returnDate) && !returnAlreadySent) {
        if (twilioClient && TWILIO_MESSAGING_SERVICE_SID) {
          try {
            // Renter return reminder
            if (renterPhone) {
              await twilioClient.messages.create({
                messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
                to: renterPhone,
                body: `GetSuited: Return is scheduled for today. Once the item has been returned, please mark it as Returned in your order page.`,
              });
            }

            // Lister return reminder
            if (listerPhone) {
              await twilioClient.messages.create({
                messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
                to: listerPhone,
                body: `GetSuited: A renter is scheduled to return an item today. Once the item is received, please mark the order as Returned in your order page.`,
              });
            }

            returnRemindersSent++;

            // Mark return reminder as sent
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
    // SUCCESS RESPONSE
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
    console.error("Unhandled error in send-sms-reminders:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
