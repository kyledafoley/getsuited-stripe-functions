const twilio = require("twilio");

exports.handler = async () => {
  const headers = { "Content-Type": "application/json" };

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken  = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const targetSid  = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

  try {
    const client = twilio(accountSid, authToken);

    const services = await client.verify.v2.services.list({ limit: 50 });

    const visible = services.map(s => ({ sid: s.sid, name: s.friendlyName }));
    const hasTarget = services.some(s => s.sid === targetSid);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        accountSidPrefix: accountSid.slice(0, 8),
        targetSid,
        hasTarget,
        visibleServices: visible,
        note:
          "If hasTarget is false, the VA service is NOT owned/visible to these credentials (Twilio Project mismatch).",
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Twilio call failed",
        twilio: { status: e.status, code: e.code, message: e.message },
      }),
    };
  }
};
