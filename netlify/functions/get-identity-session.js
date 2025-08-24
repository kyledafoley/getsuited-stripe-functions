// netlify/functions/get-identity-session.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return { statusCode: 500, body: "Missing STRIPE_SECRET_KEY" };
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    // Clean + validate input
    let { id } = JSON.parse(event.body || "{}");
    id = (id || "").toString().trim();

    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: "missing_id" }) };
    }
    if (!id.startsWith("vs_")) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid_id_format", received: id }) };
    }

    const s = await stripe.identity.verificationSessions.retrieve(id);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: s.id,
        status: s.status, // requires_input | processing | verified | canceled
        last_error: s.last_error ? (s.last_error.reason || s.last_error.code) : null
      }),
    };
  } catch (e) {
    // If Stripe can't find the session, return 404 (not 500)
    if (e && e.code === "resource_missing") {
      return { statusCode: 404, body: JSON.stringify({ error: "not_found", message: e.message }) };
    }
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", message: e.message }) };
  }
};
