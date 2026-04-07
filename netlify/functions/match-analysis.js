import Groq from "groq-sdk";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!process.env.GROQ_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing GROQ_API_KEY" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { homeTeam, awayTeam, stage, group } = body;
  if (!homeTeam || !awayTeam || !stage) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing homeTeam, awayTeam, or stage" }),
    };
  }

  const stageNames = {
    group: "שלב הבתים",
    R32: "שלב ה-32",
    R16: "שמינית גמר",
    QF: "רבע גמר",
    SF: "חצי גמר",
    "3RD": "משחק על המקום השלישי",
    F: "גמר",
  };

  const stageName = stageNames[stage] || stage;
  const groupInfo = group ? ` (בית ${group})` : "";

  const prompt = `Football analyst. WC2026: ${homeTeam} vs ${awayTeam}, ${stageName}${groupInfo}.
2-sentence Hebrew analysis + score prediction.
JSON only: {"analysis":"...","homeScore":N,"awayScore":N}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.9,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);

    if (
      typeof parsed.analysis !== "string" ||
      typeof parsed.homeScore !== "number" ||
      typeof parsed.awayScore !== "number"
    ) {
      throw new Error("Invalid response structure");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
      body: JSON.stringify({
        analysis: parsed.analysis,
        homeScore: Math.max(0, Math.round(parsed.homeScore)),
        awayScore: Math.max(0, Math.round(parsed.awayScore)),
      }),
    };
  } catch (err) {
    console.error("Groq API error:", err?.message || err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `שגיאת API: ${err?.message || "לא זמין כרגע"}`,
      }),
    };
  }
}
