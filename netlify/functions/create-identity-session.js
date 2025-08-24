// netlify/functions/create-identity-session.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return { statusCode: 500, body: 'Missing STRIPE_SECRET_KEY' };
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecret, { apiVersion: '2024-06-20' });

    // Example: Create an Identity Verification session
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: { document: { allowed_types: ['driving_license', 'passport', 'id_card'] } },
      require_matching_selfie: true,
      require_live_capture: true,
      return_url: 'https://yourdomain.com/verified', // change this
    });

    return {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: verificationSession.url,
    id: verificationSession.id,
    status: verificationSession.status
  }),
};

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
