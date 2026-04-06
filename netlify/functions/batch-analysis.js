import { GoogleGenAI } from "@google/genai";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { matches, type } = body;

  if (type === "topScorer") {
    return handleTopScorer(apiKey);
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing matches array" }),
    };
  }

  const matchList = matches
    .map((m) => `${m.id}: ${m.homeTeamName} vs ${m.awayTeamName}`)
    .join("\n");

  const stageInfo = matches[0].stage === "group"
    ? `שלב הבתים, בית ${matches[0].group}`
    : getStageLabel(matches[0].stage);

  // Random seed so each user gets different results
  const seed = Math.floor(Math.random() * 10000);

  const prompt = `You are an expert football analyst predicting FIFA World Cup 2026 results.
Random variation seed: ${seed} — use this to vary your predictions from other runs.

Predict realistic scores for these matches (${stageInfo}):

${matchList}

IMPORTANT RULES FOR REALISTIC WORLD CUP PREDICTIONS:
- Base predictions on real team strength and FIFA rankings.
- But the World Cup ALWAYS has surprises. In real World Cups, about 20-30% of group stage matches end in upsets.
- Include 1-2 upsets in this group where a weaker team wins by a narrow margin (1-0 or 2-1).
- Include at least 1 draw (0-0 or 1-1). Draws are common in group stages (~25% of matches).
- Use VARIED scores. Don't repeat the same score more than twice. Mix: 1-0, 0-0, 2-1, 0-1, 1-1, 3-1, 2-0, 0-2, etc.
- Most matches should have 0-3 total goals. Occasionally one can have 4-5 total goals.
- Upsets should be realistic (1-0, 2-1) not extreme (5-0 for a weak team).

Return ONLY a JSON array, no markdown, no explanation:
[{"id": "match-id", "homeScore": 2, "awayScore": 1}, ...]

Return predictions for ALL ${matches.length} matches.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    const text = response.text.trim();

    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) throw new Error("Response is not an array");

    const results = parsed.map((p) => ({
      id: p.id,
      homeScore: Math.max(0, Math.round(Number(p.homeScore) || 0)),
      awayScore: Math.max(0, Math.round(Number(p.awayScore) || 0)),
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    };
  } catch (err) {
    console.error("Gemini batch error:", err?.message || err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `שגיאת API: ${err?.message || "לא זמין כרגע"}`,
      }),
    };
  }
}

async function handleTopScorer(apiKey) {
  const seed = Math.floor(Math.random() * 10000);
  const prompt = `You are an expert football analyst predicting the FIFA World Cup 2026 Golden Boot winner.
Random seed: ${seed}

Pick ONE player who could realistically win the Golden Boot. Don't always pick the obvious choice.
Consider: Mbappé, Haaland, Vinicius Jr, Kane, Salah, Lewandowski, Lautaro Martínez, Isak, Gyökeres, Son, Osimhen, Yamal, Saka, Álvarez, Retegui, and other realistic candidates.

Return ONLY valid JSON, no markdown:
{"name": "Player Name", "team": "Country"}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    const text = response.text.trim();
    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: parsed.name, team: parsed.team }),
    };
  } catch (err) {
    console.error("Gemini topScorer error:", err?.message || err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `שגיאת API: ${err?.message}` }),
    };
  }
}

function getStageLabel(stage) {
  const names = {
    R32: "שלב ה-32",
    R16: "שמינית גמר",
    QF: "רבע גמר",
    SF: "חצי גמר",
    "3RD": "מקום שלישי",
    F: "גמר",
  };
  return names[stage] || stage;
}
