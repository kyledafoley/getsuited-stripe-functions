// netlify/functions/send-sms-reminders.js
// Daily SMS reminders for pickups + returns (renter & lister)

const twilio = require("twilio");

// ========= CONFIG: UPDATE FIELD KEYS TO MATCH ADALO API DOCS =========
// These must match the *API property names* in the Orders & Users docs,
// NOT necessarily the pretty labels you see in the UI.

const ORDER_FIELDS = {
  pickupDate: "Item Pick Up Date",      // key for "Item Pick Up Date"
  returnDate: "Return Due Date",        // key for "Return Due Date"
  isPaid: "isPaid",                     // true/false
  pickupSmsSentAt: "pickup_sms_sent_at",
  returnSmsSentAt: "return_sms_sent_at",
  renter: "Renter",                     // relationship → Users (renter)
  lister: "Lister"                      // relationship → Users (lister)
};

const USER_FIELDS = {
  phone: "Mobile Number",  // 💡 your Users phone field
  smsOptIn: "sms_opt_in"   // change if your toggle has a different API name
};
// ====================================================================

const ADALO_BASE = `https://api.adalo.com/v0/apps/${process.env.ADALO_APP_ID}`;
const ORDERS_COLLECTION = process.env.ADALO_ORDERS_COLLECTION_ID;
const USERS_COLLECTION = process.env.ADALO_USERS_COLLECTION_ID;

const ADALO_HEADERS = {
  Authorization: `Bearer ${process.env.ADALO_API_KEY}`,
  "Content-Type": "application/json"
};

// Normalize US phone numbers for Twilio (expects +1XXXXXXXXXX)
function normalizeUsPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendSms(to, body) {
  const client = getTwilioClient();

  const payload = { to, body };

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  } else if (process.env.TWILIO_FROM_NUMBER) {
    payload.from = process.env.TWILIO_FROM_NUMBER;
  } else {
    throw new Error("No TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER set");
  }

  return client.messages.create(payload);
}

// Fetch orders by date field (pickup OR return) where isPaid = true
async function fetchOrdersByDateField(dateFieldKey, dateString) {
  const url =
    `${ADALO_BASE}/collections/${ORDERS_COLLECTION}` +
    `?filters[${encodeURIComponent(ORDER_FIELDS.isPaid)}]=true` +
    `&filters[${encodeURIComponent(dateFieldKey)}]=${encodeURIComponent(
      dateString
    )}`;

  const res = await fetch(url, { headers: ADALO_HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adalo Orders fetch failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  // Adalo sometimes returns { records: [...] } and sometimes just [...]
  return Array.isArray(json) ? json : json.records || [];
}

async function fetchUser(userId) {
  if (!userId) return null;
  const url = `${ADALO_BASE}/collections/${USERS_COLLECTION}/${userId}`;
  const res = await fetch(url, { headers: ADALO_HEADERS });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

async function updateOrder(orderId, updates) {
  const url = `${ADALO_BASE}/collections/${ORDERS_COLLECTION}/${orderId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: ADALO_HEADERS,
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update Order ${orderId}: ${res.status} - ${text}`);
  }

  return res.json();
}

// SMS message builders
function getPickupMessages(pickupDate) {
  return {
    renter: `GetSuited: Your item is scheduled for pickup today (${pickupDate}). After you pick it up, open GetSuited and tap "Confirm Pick Up."`,
    lister: `GetSuited: A renter is scheduled to pick up your item today (${pickupDate}). Once they’ve collected it, open GetSuited to monitor the order status.`
  };
}

function getReturnMessages(returnDate) {
  return {
    renter: `GetSuited: Your item rental is due back today (${returnDate}). After you return it, open GetSuited and tap "Mark Item as Returned."`,
    lister: `GetSuited: A renter is scheduled to return your item today (${returnDate}). Once you receive it, open GetSuited and tap "Mark Item as Dropped Off," then tap "Approve Return" to finish the order.`
  };
}

function canReceiveSms(user) {
  if (!user) return false;
  const phoneRaw = user[USER_FIELDS.phone];
  const optIn = user[USER_FIELDS.smsOptIn];
  const normalized = normalizeUsPhone(phoneRaw);
  return Boolean(normalized && optIn === true);
}

// Main handler
exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};
    const todayStr = query.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const pickupOrders = await fetchOrdersByDateField(
      ORDER_FIELDS.pickupDate,
      todayStr
    );
    const returnOrders = await fetchOrdersByDateField(
      ORDER_FIELDS.returnDate,
      todayStr
    );

    let pickupCount = 0;
    let returnCount = 0;

    // ----- Pickup reminders -----
    for (const order of pickupOrders) {
      const orderId = order.id || order._id;
      if (!orderId) continue;

      if (order[ORDER_FIELDS.pickupSmsSentAt]) continue;

      const pickupDate = order[ORDER_FIELDS.pickupDate];
      const renterId = order[ORDER_FIELDS.renter];
      const listerId = order[ORDER_FIELDS.lister];

      const [renter, lister] = await Promise.all([
        fetchUser(renterId),
        fetchUser(listerId)
      ]);

      const messages = getPickupMessages(pickupDate);

      if (canReceiveSms(renter)) {
        const to = normalizeUsPhone(renter[USER_FIELDS.phone]);
        await sendSms(to, messages.renter);
        pickupCount++;
      }

      if (canReceiveSms(lister)) {
        const to = normalizeUsPhone(lister[USER_FIELDS.phone]);
        await sendSms(to, messages.lister);
        pickupCount++;
      }

      await updateOrder(orderId, {
        [ORDER_FIELDS.pickupSmsSentAt]: new Date().toISOString()
      });
    }

    // ----- Return reminders -----
    for (const order of returnOrders) {
      const orderId = order.id || order._id;
      if (!orderId) continue;

      if (order[ORDER_FIELDS.returnSmsSentAt]) continue;

      const returnDate = order[ORDER_FIELDS.returnDate];
      const renterId = order[ORDER_FIELDS.renter];
      const listerId = order[ORDER_FIELDS.lister];

      const [renter, lister] = await Promise.all([
        fetchUser(renterId),
        fetchUser(listerId)
      ]);

      const messages = getReturnMessages(returnDate);

      if (canReceiveSms(renter)) {
        const to = normalizeUsPhone(renter[USER_FIELDS.phone]);
        await sendSms(to, messages.renter);
        returnCount++;
      }

      if (canReceiveSms(lister)) {
        const to = normalizeUsPhone(lister[USER_FIELDS.phone]);
        await sendSms(to, messages.lister);
        returnCount++;
      }

      await updateOrder(orderId, {
        [ORDER_FIELDS.returnSmsSentAt]: new Date().toISOString()
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        date: todayStr,
        pickupMessagesSent: pickupCount,
        returnMessagesSent: returnCount
      })
    };
  } catch (err) {
    console.error("Error in send-sms-reminders:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" })
    };
  }
};
