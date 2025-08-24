// netlify/functions/create-identity-session.js
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

    // Optional inputs from Adalo
    const { userId, email } = JSON.parse(event.body || "{}");

    // Create the verification session (SELFIE REQUIRED)
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      options: {
        document: {
          allowed_types: ["driving_license", "passport", "id_card"],
          require_matching_selfie: true,   // selfie must match the ID
          require_live_capture: true       // (optional) force live camera capture
        }
      },
      metadata: { userId: userId || "", email: email || "", app: "getsuited" },
      return_url: "https://gsidentityverification.netlify.app/verified"
    });

    // Return the values Adalo expects
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: session.url,
        id: session.id,
        status: session.status // typically 'requires_input' initially
      })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
