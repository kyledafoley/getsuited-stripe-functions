// netlify/functions/check-otp.js

exports.handler = async (event) => {
  try {
    // Handle preflight (important for some iOS/webview requests)
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const mustGetEnv = (k) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing env var: ${k}`);
      return v;
    };

    const AC = mustGetEnv("TWILIO_ACCOUNT_SID");
    const AUTH = mustGetEnv("TWILIO_AUTH_TOKEN");
    const SERVICE = mustGetEnv("TWILIO_VERIFY_SERVICE_SID"); // MUST start with VA

    const basicAuth = Buffer.from(`${AC}:${AUTH}`).toString("base64");

    const body = JSON.parse(event.body || "{}");
    const { phone, to, code } = body;

    let dest = (to || phone || "").trim();
    const passcode = (code || "").toString().trim();

    if (!dest || !passcode) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing phone/to or code" }),
      };
    }

    // Normalize to E.164
    if (!dest.startsWith("+")) {
      dest = "+1" + dest.replace(/\D/g, "");
    }

    const params = new URLSearchParams({ To: dest, Code: passcode });

    // ✅ IMPORTANT: endpoint is VerificationCheck (singular)
    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${SERVICE}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: data }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        status: data.status,
        valid: data.status === "approved",
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
