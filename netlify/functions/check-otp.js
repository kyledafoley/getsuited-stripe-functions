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
    const region = String(process.env.TWILIO_REGION || "").trim(); // optional: ie1, au1, etc.

    if (!accountSid || !authToken || !serviceSid) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing Twilio env vars",
          missing: {
            TWILIO_ACCOUNT_SID: !accountSid,
            TWILIO_AUTH_TOKEN: !authToken,
            TWILIO_VERIFY_SERVICE_SID: !serviceSid,
          },
        }),
      };
    }

    // If TWILIO_AUTH_TOKEN is set as "SK...:SECRET", treat it as API Key mode
    const isApiKeyMode = authToken.startsWith("SK") && authToken.includes(":");

    let client;
    if (isApiKeyMode) {
      const parts = authToken.split(":");
      const apiKeySid = (parts[0] || "").trim();
      const apiKeySecret = (parts[1] || "").trim();

      client = twilio(apiKeySid, apiKeySecret, {
        accountSid,
        ...(region ? { region } : {}),
      });
    } else {
      client = twilio(accountSid, authToken, {
        ...(region ? { region } : {}),
      });
    }

    // Diagnostic: can we fetch the Verify service?
    await client.verify.v2.services(serviceSid).fetch();

    // OTP check
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
