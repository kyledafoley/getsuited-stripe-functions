// netlify/functions/check-otp.js
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
    const { to, code } = JSON.parse(event.body || "{}");

    if (!to || !code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing `to` or `code`" }),
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

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

    const client = twilio(accountSid, authToken);

    // ✅ THIS is the key diagnostic step
    try {
      await client.verify.v2.services(serviceSid).fetch();
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Verify Service SID not accessible with current credentials",
          hint: "This means your TWILIO_VERIFY_SERVICE_SID and TWILIO_ACCOUNT_SID/AUTH_TOKEN are from different Twilio accounts/subaccounts.",
          twilio: {
            status: e.status,
            code: e.code,
            message: e.message,
          },
        }),
      };
    }

    const check = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to, code });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: check.status, // "approved" or "pending"
        approved: check.status === "approved",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Unexpected server error",
        message: err.message,
      }),
    };
  }
};
