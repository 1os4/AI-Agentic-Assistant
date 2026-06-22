export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: "Gemini API key is not configured." });
  }

  try {
    const { model = "gemini-2.5-flash", ...requestBody } = request.body || {};
    const safeModel = /^[A-Za-z0-9_.-]+$/.test(model) ? model : "gemini-2.5-flash";
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const text = await geminiResponse.text();
    response.status(geminiResponse.status);
    response.setHeader("Content-Type", geminiResponse.headers.get("content-type") || "application/json");
    return response.send(text);
  } catch {
    return response.status(502).json({ error: "Gemini request failed." });
  }
}
