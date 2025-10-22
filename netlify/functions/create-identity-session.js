// netlify/functions/create-identity-session.js
exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }) };
    }

    const Stripe = require("stripe");
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    const { userId, email } = JSON.parse(event.body || "{}");

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      options: {
        document: {
          allowed_types: ["driving_license", "passport", "id_card"],
          require_matching_selfie: true,
          require_live_capture: true,
        },
      },
      metadata: { userId: userId || "", email: email || "", app: "getsuited" },
      return_url: "https://gsidentityverification.netlify.app/verified",
    });

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        url: session.url,
        id: session.id,
        status: session.status,
      }),
    };
