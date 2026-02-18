exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) {}

    const to = String(body.to || "").trim();

    if (!to) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: "Missing `to`" })
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const region = process.env.TWILIO_REGION || "us1";

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const base = `https://verify.${region}.twilio.com`;

    const url = `${base}/v2/Services/${serviceSid}/Verifications`;

    const form = new URLSearchParams();
    form.append("To", to);
    form.append("Channel", "sms");

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    if (!resp.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "Twilio Verify start failed",
          twilio: data
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        status: data.status, // usually "pending"
        to: data.to
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
