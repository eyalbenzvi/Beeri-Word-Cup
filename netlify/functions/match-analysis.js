import { GoogleGenerativeAI } from "@google/generative-ai";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
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

  const prompt = `You are an expert football analyst. Analyze this FIFA World Cup 2026 match:

${homeTeam} vs ${awayTeam} — ${stageName}${groupInfo}

Based on current team strength, FIFA rankings, recent form, historical matchups, and playing style:

1. Give a concise analysis in Hebrew (2-3 sentences max). Be specific about WHY one team is favored.
2. Predict the most likely score.

IMPORTANT: Return ONLY valid JSON in this exact format, no markdown, no code blocks:
{"analysis": "הניתוח בעברית כאן", "homeScore": 2, "awayScore": 1}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse the JSON response, handling possible markdown wrapping
    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

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
    console.error("Gemini API error:", err?.message || err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `שגיאת API: ${err?.message || "לא זמין כרגע"}`,
      }),
    };
  }
}
