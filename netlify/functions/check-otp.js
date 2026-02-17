const twilio = require("twilio");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const to = String(body.to || "").trim();
    const code = String(body.code || "").trim();

    if (!to || !code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing `to` or `code`" }),
      };
    }

    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();
    const region = String(process.env.TWILIO_REGION || "").trim(); // ie1, au1, etc.

    if (!accountSid || !authToken || !serviceSid) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing Twilio environment variables",
        }),
      };
    }

    // Create Twilio client with optional region
    const client = twilio(accountSid, authToken, {
      ...(region ? { region } : {}),
    });

    // 🔍 Diagnostic: confirm service is reachable
    try {
      await client.verify.v2.services(serviceSid).fetch();
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Verify service fetch failed",
          twilio: {
            status: e.status,
            code: e.code,
            message: e.message,
          },
          regionUsed: region || "default (us1)",
          hint:
            "If 404, confirm TWILIO_REGION matches your Twilio Console region and that the Service SID belongs to this account.",
        }),
      };
    }

    // ✅ Check OTP
    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to, code });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        approved: check.status === "approved",
        status: check.status,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Unexpected server error",
        message: err && err.message ? err.message : String(err),
      }),
    };
  }
};
