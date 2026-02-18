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
    const body = JSON.parse(event.body || "{}");

    const to = String(body.to || "").trim();
    const code = String(body.code || "").trim();

    if (!to || !code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "Missing `to` or `code`"
        })
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationChecks`;

    const form = new URLSearchParams();
    form.append("To", to);
    form.append("Code", code);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "Twilio Verify check failed",
          httpStatus: resp.status,
          twilio: data
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        status: data.status,
        approved: data.status === "approved"
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: err.message
      })
    };
  }
};
