// netlify/functions/check-otp.js

const json = (statusCode, obj, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extraHeaders,
  },
  body: JSON.stringify(obj),
});

const mustEnv = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};

const normalizeUSPhone = (input) => {
  if (!input) return "";
  const raw = String(input).trim();

  // Already E.164
  if (raw.startsWith("+")) return raw;

  // Strip non-digits
  const digits = raw.replace(/\D/g, "");

  // If they passed 10 digits, assume US
  if (digits.length === 10) return `+1${digits}`;

  // If they passed 11 digits starting with 1, US
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Otherwise, fail (forces you to pass E.164 for non-US)
  return "";
};

exports.handler = async (event) => {
  // Preflight (important for some webviews)
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const TWILIO_ACCOUNT_SID = mustEnv("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = mustEnv("TWILIO_AUTH_TOKEN");
    const TWILIO_VERIFY_SERVICE_SID = mustEnv("TWILIO_VERIFY_SERVICE_SID");

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    // Accept either { phone, code } or { to, code }
    const toRaw = (body.to || body.phone || "").trim();
    const codeRaw = String(body.code || "").trim();

    if (!toRaw || !codeRaw) {
      return json(400, { error: "Missing 'to/phone' or 'code'" });
    }

    const to = normalizeUSPhone(toRaw);
    if (!to) {
      return json(400, {
        error:
          "Invalid phone format. Use +E.164 (preferred) or a 10-digit US number.",
      });
    }

    // Twilio Verify codes are typically 4–10 chars; you’re using 6-digit.
    if (codeRaw.length < 4 || codeRaw.length > 10) {
      return json(400, { error: "Invalid code length" });
    }

    const basicAuth = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Code", codeRaw);

    const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const dataText = await resp.text();
    let data;
    try {
      data = JSON.parse(dataText);
    } catch {
      data = { raw: dataText };
    }

    // Helpful debug without exposing secrets
    console.log("check-otp:", {
      http: resp.status,
      serviceLast6: TWILIO_VERIFY_SERVICE_SID.slice(-6),
      toLast4: to.slice(-4),
      twilioStatus: data?.status,
      twilioCode: data?.code,
      twilioMessage: data?.message,
    });

    if (!resp.ok) {
      return json(resp.status, {
        error: "Twilio Verify check failed",
        twilio: data,
      });
    }

    const status = data.status || "unknown"; // "approved" when correct
    const valid = status === "approved";

    return json(200, { status, valid });
  } catch (err) {
    console.error("check-otp exception:", err);
    return json(500, { error: err.message || "Server error" });
  }
};
