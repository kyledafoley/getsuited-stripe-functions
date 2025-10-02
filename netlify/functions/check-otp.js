// netlify/functions/check-otp.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { phone, to, code } = JSON.parse(event.body || '{}');
    const dest = (to || phone || '').trim();
    if (!dest || !code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing phone or code' }) };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({ To: dest, Code: code });

    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      // surface Twilio's error as-is for easier debugging
      return { statusCode: resp.status, body: JSON.stringify({ error: data }) };
    }

    // data.status is usually "approved" or "pending"
    return { statusCode: 200, body: JSON.stringify({ status: data.status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
