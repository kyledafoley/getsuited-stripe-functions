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
    const edge = String(process.env.TWILIO_EDGE || "").trim();     // dublin, sydney, etc.

    if (!accountSid || !authToken || !serviceSid) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing Twilio environment variables",
          missing: {
            TWILIO_ACCOUNT_SID: !accountSid,
            TWILIO_AUTH_TOKEN: !authToken,
            TWILIO_VERIFY_SERVICE_SID: !serviceSid,
          },
        }),
      };
    }

    // ✅ IMPORTANT: set BOTH region and edge when using Twilio Regions
    const client = twilio(accountSid, authToken, {
      ...(region ? { region } : {}),
      ...(edge ? { edge } : {}),
    });

    // Diagnostic: confirm Verify service is reachable
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
          routing: {
            regionUsed: region || null,
            edgeUsed: edge || null,
          },
          hint:
            "If you set TWILIO_REGION, also set TWILIO_EDGE (eg dublin for ie1).",
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

