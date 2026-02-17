// netlify/functions/check-otp.js

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  // Handle CORS preflight (important for iOS/webviews)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
    }

    const mustGetEnv = (k) => {
      const v = process.env[k];
      if (!v) throw new Error(`Missing env var: ${k}`);
      return v;
    };

    const AC = mustGetEnv("TWILIO_ACCOUNT_SID");         // ACxxxxxxxx
    const AUTH = mustGetEnv("TWILIO_AUTH_TOKEN");
    const SERVICE = mustGetEnv("TWILIO_VERIFY_SERVICE_SID"); // VAxxxxxxxx

    const basicAuth = Buffer.from(`${AC}:${AUTH}`).toString("base64");

    const payload = JSON.parse(event.body || "{}");
    const code = (payload.code || "").toString().trim();
    let to = (payload.to || payload.phone || "").toString().trim();

    if (!to || !code) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing to/phone or code" }),
      };
    }

    // Normalize phone: keep digits, add +1 if missing country code
    const digits = to.replace(/\D/g, "");
    if (to.startsWith("+")) {
      to = "+" + digits;
    } else {
      // assumes US numbers if no +countrycode supplied
      to = "+1" + digits;
    }

    const params = new URLSearchParams();
    params.append("To", to);
    params.append("Code", code);

    const url = `https://verify.twilio.com/v2/Services/${SERVICE}/VerificationCheck`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: data,
          hint:
            "If you see 20404, confirm TWILIO_VERIFY_SERVICE_SID (VA...) exists in the SAME Twilio Project as TWILIO_ACCOUNT_SID/AUTH_TOKEN.",
        }),
      };
    }

    const valid = data.status === "approved";

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: data.status, valid }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
