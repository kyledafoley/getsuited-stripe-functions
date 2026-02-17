exports.handler = async function (event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: headers, body: "" };
  }

  try {
    var body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }

    var to = String(body.to || "").trim();
    if (!to) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Missing `to`" }) };
    }

    var accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    var authToken  = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    var serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

    var basic = Buffer.from(accountSid + ":" + authToken).toString("base64");

    // ✅ Start Verify (creates the pending verification)
    var url = "https://verify.twilio.com/v2/Services/" + serviceSid + "/Verifications";

    var form = new URLSearchParams();
    form.append("To", to);
    form.append("Channel", "sms");

    var resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    var text = await resp.text();
    var data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    if (!resp.ok) {
      return {
        statusCode: 500,
        headers: headers,
        body: JSON.stringify({ error: "Twilio Verify start failed", httpStatus: resp.status, response: data })
      };
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ status: data.status, to: data.to })
    };
  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Unexpected server error", message: err.message }) };
  }
};
