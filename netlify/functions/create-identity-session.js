// Serverless function: Create a Stripe Identity Verification Session
// Path: netlify/functions/create-identity-session.js

const Stripe = require("stripe");

exports.handler = async (event) => {
  // ---- CORS (required for Adalo custom actions) ----
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Content-Type": "application/json",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // ---- Config ----
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: "Missing STRIPE_SECRET_KEY env var" }),
      };
    }

    // Optional: override return URL via env
    const returnUrl =
      process.env.IDENTITY_RETURN_URL ||
      "https://gsidentityverification.netlify.app/verified";

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    // Parse optional inputs from Adalo
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (_) {
      // If body isn't valid JSON, continue with empty payload
      payload = {};
    }
    const { userId = "", email = "" } = payload;

    // ---- Create session ----
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      options: {
        document: {
          allowed_types: ["driving_license", "passport", "id_card"],
          require_matching_selfie: true,
          require_live_capture: true,
        },
      },
      metadata: { userId, email, app: "getsuited" },
      return_url: returnUrl,
    });

    // ---- Response expected by Adalo ----
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        id: session.id,
        status: session.status, // typically 'requires_input'
        url: session.url,       // use this in Adalo "Open External Website"
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: e.message || "Unknown error" }),
    };
  }
};
