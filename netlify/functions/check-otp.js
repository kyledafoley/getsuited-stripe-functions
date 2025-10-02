exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const mustGetEnv = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing env var: ${k}`); return v; };
    const AC = mustGetEnv('TWILIO_ACCOUNT_SID');
    const AUTH = mustGetEnv('TWILIO_AUTH_TOKEN');
    const SERVICE = mustGetEnv('TWILIO_VERIFY_SERVICE_SID');
    const basicAuth = Buffer.from(`${AC}:${AUTH}`).toString('base64');

    const { phone, to, code } = JSON.parse(event.body || '{}');
    const dest = (to || phone || '').trim();
    if (!dest || !code) return { statusCode: 400, body: JSON.stringify({ error: 'Missing phone/to or code' }) };

    const params = new URLSearchParams({ To: dest, Code: code });
    const resp = await fetch(`https://verify.twilio.com/v2/Services/${SERVICE}/VerificationCheck`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await resp.json();
    if (!resp.ok) return { statusCode: resp.status, body: JSON.stringify({ error: data }) };

    return { statusCode: 200, body: JSON.stringify({ status: data.status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
