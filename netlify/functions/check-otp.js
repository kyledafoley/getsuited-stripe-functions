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
    const code = String(body.code || "").trim();

    if (!to || !code) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: "Missing `to` or `code`" }) };
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks
      .create({ to, code });

    const status = String(check.status || "").toLowerCase();
    const approved = status === "approved";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, status, approved }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: "Verify check failed", message: err.message }),
    };
  }
};
