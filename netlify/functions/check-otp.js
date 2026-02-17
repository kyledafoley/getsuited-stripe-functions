// netlify/functions/check-otp.js
const twilio = require("twilio");

function getTwilioClient() {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const serviceSid = (process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

  // Optional (only if your Twilio project is in a specific region like "ie1", "au1")
  const region = (process.env.TWILIO_REGION || "").trim(); // e.g. "ie1"

  if (!accountSid || !serviceSid) {
    const missing = {
      TWILIO_ACCOUNT_SID: !accountSid,
      TWILIO_VERIFY_SERVICE_SID: !serviceSid,
      // token could be auth token OR api key secret; checked below
    };
    throw new Error(
      `Missing required env vars: ${Object.entries(missing)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ")}`
    );
  }

  // Support two modes:
  // 1) Standard: accountSid + authToken
  // 2) API Key: authToken env var contains "SKxxxx:SECRET" (recommended for Netlify)
  //    Example: TWILIO_AUTH_TOKEN="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:your_api_key_secret"
  const hasApiKeyPair = authToken.startsWith("SK") && authToken.includes(":");

  let client;
  if (hasApiKeyPair) {
    const [apiKeySid, apiKeySecret] = authToken.split(":");
    if (!apiKeySid || !apiKeySecret) {
      throw new Error("TWILIO_AUTH_TOKEN is formatted like an API key but missing ':' secret.");
    }
    client = twilio(apiKeySid.trim(), apiKeySecret.trim(), {
      accountSid,
      ...(region ? { region } : {}),
    });
  } else {
    if (!authToken) {
      throw new Error("Missing TWILIO_AUTH_TOKEN (Auth Token or API Key pair).");
    }
    client = twilio(accountSid, authToken, {
      ...(region ? { region } : {}),
    });
  }

  return { client,
