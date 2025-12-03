// netlify/functions/send-otp.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const mustGetEnv = (k) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing env var: ${k}`);
      return v;
    };

    const AC = mustGetEnv('TWILIO_ACCOUNT_SID');
    const AUTH = mustGetEnv('TWILIO_AUTH_TOKEN');
    const SERVICE = mustGetEnv('TWILIO_VERIFY_SERVICE_SID');
    const basicAuth = Buffer.from(`${AC}:${AUTH}`).toString('base64');

    const { phone, to } = JSON.parse(event.body || '{}');
    let dest = (to || phone || '').trim();

    if (!dest) {
      console.log('send-otp: missing phone/to', event.body);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing phone/to' }),
      };
    }

    // Ensure E.164 for US if user only passes 10 digits
    if (!dest.startsWith('+')) {
      // assume US
      dest = '+1' + dest.replace(/\D/g, '');
    }

    console.log('send-otp: sending code to', dest);

    const params = new URLSearchParams({ To: dest, Channel: 'sms' });

    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${SERVICE}/Verifications`,
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
    console.log('send-otp: Twilio response status', resp.status, data);

    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ status: data.status }) };
  } catch (e) {
    console.error('send-otp: exception', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
