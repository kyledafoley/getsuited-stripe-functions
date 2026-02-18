const twilio = require("twilio");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const body = JSON.parse(event.body || "{}");
    const to = String(body.to || "").trim();

    if (!to) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: "Missing `to`" }) };
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications
      .create({ to, channel: "sms" });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, status: verification.status, to: verification.to }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: "Verify start failed", message: err.message }),
    };
  }
};
