exports.handler = async function (event) {
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
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) {}

    const to = String(body.to || "").trim();
    const code = String(body.code || "").trim();

    if (!to || !code) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: "Missing `to` or `code`" }),
      };
    }

    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken  = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

    if (!accountSid || !authToken || !serviceSid) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: "Server missing Twilio env vars" }),
      };
    }

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    // ✅ Correct endpoint: VerificationChecks (plural)
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
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    // Twilio returns 200 with status "approved"/"pending"/"canceled"
    // but if it's not ok, still return 200 to Adalo with ok:false
    if (!resp.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "Twilio Verify check failed",
          httpStatus: resp.status,
          twilio: data,
        }),
      };
    }

    const status = String(data.status || "").toLowerCase();
    const approved = status === "approved";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        approved,
        status,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: "Unexpected server error", message: err.message }),
    };
  }
};
