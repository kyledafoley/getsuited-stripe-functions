// netlify/functions/get-identity-session.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) return { statusCode: 500, body: "Missing STRIPE_SECRET_KEY" };

    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    const { id } = JSON.parse(event.body || "{}"); // expects vs_...
    if (!id) return { statusCode: 400, body: "Missing id" };

    const s = await stripe.identity.verificationSessions.retrieve(id);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: s.id,
        status: s.status,                 // requires_input | processing | verified | canceled
        last_error: s.last_error ? (s.last_error.reason || s.last_error.code) : null
      }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
