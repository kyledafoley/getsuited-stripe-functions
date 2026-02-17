exports.handler = async () => {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      using: {
        accountSidPrefix: accountSid.slice(0, 8),
        accountSidLen: accountSid.length,
        serviceSidPrefix: serviceSid.slice(0, 8),
        serviceSidLen: serviceSid.length,
        authTokenLen: token.length,
      },
      note:
        "Lengths should be AC=34, VA=34. If these don't match or are empty, Netlify isn't using the env vars you think.",
    }),
  };
};
