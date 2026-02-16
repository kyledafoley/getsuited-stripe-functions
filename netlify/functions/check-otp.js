// netlify/functions/check-otp.js

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Helper to require env vars
    const mustGetEnv = (k) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing env var: ${k}`);
      return v;
    };

    // Twilio credentials + Verify Service SID
    const AC = mustGetEnv("TWILIO_ACCOUNT_SID");
    const AUTH = mustGetEnv("TWILIO_AUTH_TOKEN");
    const SERVICE = mustGetEnv("TWILIO_VERIFY_SERVICE_SID");

    const basicAuth = Buffer.from(`${AC}:${AUTH}`).toString("base64");

    // Parse body safely
    const body = event.body ? JSON.parse(event.body) : {};
    const { phone, to, code } = body;

    let dest = (to || phone || "").toString().trim();
    const passcode = (code || "").toString().trim();

    if (!dest || !passcode) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing phone/to or code",
          received: { dest: !!dest, code: !!passcode },
        }),
      };
    }

    // Normalize to E.164 (defaults to US if no +)
    if (!dest.startsWith("+")) {
      dest = "+1" + dest.replace(/\D/g, "");
    }

    // Twilio Verify: VerificationChecks (plural)
    const url = `https://verify.twilio.com/v2/Services/${SERVICE}/VerificationChecks`;
    const params = new URLSearchParams({ To: dest, Code: passcode });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Pass through Twilio errors
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({
          error: data,
          hint:
            "If you see 20404, double-check TWILIO_VERIFY_SERVICE_SID is a Verify Service SID starting with 'VA' (not Account SID, Messaging Service, etc).",
        }),
      };
    }

    const valid = data.status === "approved";

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: data.status,
        valid,
        to: dest,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
