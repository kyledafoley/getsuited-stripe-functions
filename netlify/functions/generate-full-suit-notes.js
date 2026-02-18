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
    const body = JSON.parse(event.body || "{}");

    // Pull fields (exact names not required here; Adalo mapping will send keys)
    const payload = {
      condition: body.condition ?? body["Condition"],
      suitColor: body.suitColor ?? body["Suit Color"],
      inseam: body.inseam ?? body["Inseam"],
      pantsFit: body.pantsFit ?? body["PantsFit"],
      suitBrand: body.suitBrand ?? body["Suit Brand"],
      rentalPricePerDay: body.rentalPricePerDay ?? body["Rental Price (per day)"],
      occasion: body.occasion ?? body["Occasion"],
      jacketFit: body.jacketFit ?? body["JacketFit"],
      waist: body.waist ?? body["Waist"],
      alterations: body.alterations ?? body["Alterations"],
      chestSize: body.chestSize ?? body["Chest Size"],
      jacketLength: body.jacketLength ?? body["Jacket Length"],
      standOut: body.standOut ?? body["StandOut"],
    };

    const instructions =
      "You write concise, high-converting rental listing notes for GetSuited (formalwear marketplace). " +
      "Return ONLY plain text. No emojis. No bullets longer than a single line. Keep it 70–120 words.";

    const userPrompt = `
Generate “Full Suit Notes” using ONLY the details below. Be confident and professional.

Suit Brand: ${payload.suitBrand ?? "N/A"}
Suit Color: ${payload.suitColor ?? "N/A"}
Occasion: ${payload.occasion ?? "N/A"}
Condition: ${payload.condition ?? "N/A"}
StandOut: ${payload.standOut ?? "N/A"}
Alterations: ${payload.alterations ?? "N/A"}

Fit details:
Jacket Fit: ${payload.jacketFit ?? "N/A"}
Jacket Length: ${payload.jacketLength ?? "N/A"}
Chest Size: ${payload.chestSize ?? "N/A"}
Pants Fit: ${payload.pantsFit ?? "N/A"}
Waist: ${payload.waist ?? "N/A"}
Inseam: ${payload.inseam ?? "N/A"}

Price: $${payload.rentalPricePerDay ?? "N/A"} per day

Write it like a polished marketplace listing note that boosts renter confidence.
`;

    // OpenAI Responses API call
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input: userPrompt,
        temperature: 0.7,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: "OpenAI request failed", details: data }),
      };
    }

    // Extract text from Responses API output
    const fullSuitNotes =
      (data.output_text && String(data.output_text).trim()) ||
      "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, fullSuitNotes }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
