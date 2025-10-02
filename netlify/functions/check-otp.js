// netlify/functions/check-otp.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { phone, to, code } = JSON.parse(event.body || '{}');
    const dest = to || phone; // accept either
    if (!dest || !code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing phone or code' }) };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    // TEMP LOGS (remove later): confirm both functions see the same values
    console.log('AC:', accountSid, 'VA:', verifyServiceSid);

    const twilio = require('twilio')(accountSid, authToken);

    const result = await twilio.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: dest, code });

    return { statusCode: 200, body: JSON.stringify({ status: result.status }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
