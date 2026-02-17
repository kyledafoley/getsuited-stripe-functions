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
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing `to` or `code`" }) };
    }

    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

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

    // Basic auth header for Twilio REST API
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    // ✅ Correct Verify endpoint (plural VerificationChecks)
    const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationChecks`;

    const form = new URLSearchParams();
    form.append("To", to);
    form.append("Code", code);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {

