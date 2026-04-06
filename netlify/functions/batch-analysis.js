import { GoogleGenAI } from "@google/genai";

// ---- Variety generators ----

const PERSONAS = [
  { name: "סטטיסטיקאי", style: "You are a cold, data-driven statistician. You trust the numbers above all. Predict based strictly on FIFA rankings, historical win rates, and expected goals models." },
  { name: "רומנטיקן", style: "You are a romantic football fan who loves the beautiful game. You believe in the magic of underdogs and the drama of the World Cup. You predict more upsets than average." },
  { name: "פרשן הגנתי", style: "You are a defensive-minded analyst. You think low-scoring games are more likely. You favor strong defensive teams and predict more 1-0 and 0-0 results." },
  { name: "פרשן התקפי", style: "You are an attacking-minded analyst. You love goals and open games. You predict higher-scoring matches and think World Cup 2026 will be a goal fest." },
  { name: "חובב הפתעות", style: "You believe World Cup 2026 will be full of surprises. Historically, every World Cup has shocking upsets. You predict more upsets than the consensus, especially by narrow margins." },
  { name: "פרשן דרום אמריקאי", style: "You are a South American analyst. You have extra faith in CONMEBOL teams (Brazil, Argentina, Uruguay, Colombia, Paraguay, Ecuador). You think they perform better than rankings suggest." },
  { name: "פרשן אירופאי", style: "You are a European analyst. You trust UEFA teams (France, Germany, Spain, England, etc.) and think European tactical discipline wins tournaments." },
  { name: "אוהד אפריקה ואסיה", style: "You believe African and Asian teams are underrated. Teams like Morocco, Senegal, Japan, South Korea, and Saudi Arabia will surprise many. Predict accordingly." },
];

const NARRATIVES = [
  "This tournament, home advantage (USA/Mexico/Canada) is massive — host nations go deep.",
  "This World Cup is defined by defensive football — low-scoring matches dominate.",
  "This is a tournament of upsets — at least 30% of group matches are won by underdogs.",
  "South American teams dominate this World Cup — Brazil and Argentina lead but others shine too.",
  "European teams struggle with the heat and travel — non-European teams do better than expected.",
  "This World Cup has the most draws in history — teams play cautiously in group stages.",
  "Young stars break through — teams with young talent (Yamal, Saka, Isak) overperform.",
  "Experience wins — teams with veteran squads outperform younger teams.",
];

const MOODS = [
  "tight defensive battle", "open attacking game", "cagey first half then late drama",
  "early goal settles it", "goalless stalemate", "comeback thriller",
  "dominant display by the favorite", "scrappy upset",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateVarietyContext() {
  const persona = pickRandom(PERSONAS);
  const narrative = pickRandom(NARRATIVES);
  const temperature = 0.8 + Math.random() * 0.7; // 0.8 - 1.5
  const seed = Math.floor(Math.random() * 100000);

  // Pick 2-3 random dark horse teams
  const darkHorses = ["MAR", "JPN", "KOR", "SEN", "AUS", "TUR", "CIV", "EGY", "IRQ", "NOR", "AUT", "SCO", "GHA", "UZB"];
  const picked = [];
  while (picked.length < 2) {
    const dh = pickRandom(darkHorses);
    if (!picked.includes(dh)) picked.push(dh);
  }

  return { persona, narrative, temperature, seed, darkHorses: picked };
}

// ---- Handler ----

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

  const variety = generateVarietyContext();

  const matchList = matches
    .map((m) => `${m.id}: ${m.homeTeamName} vs ${m.awayTeamName}`)
    .join("\n");

  const stageInfo = matches[0].stage === "group"
    ? "שלב הבתים"
    : getStageLabel(matches[0].stage);

  // Assign random moods to some matches for extra variety
  const moodHints = matches.length > 4
    ? matches.slice(0, 3).map((m) => `${m.id}: mood is "${pickRandom(MOODS)}"`).join("; ")
    : "";

  const prompt = `${variety.persona.style}

TOURNAMENT NARRATIVE: ${variety.narrative}
RANDOM SEED: ${variety.seed}

Predict realistic scores for these FIFA World Cup 2026 matches (${stageInfo}):

${matchList}

${moodHints ? `MATCH MOODS (use these to influence specific predictions): ${moodHints}` : ""}
${variety.darkHorses.length ? `DARK HORSES this tournament: ${variety.darkHorses.join(", ")} — give them better results if they appear.` : ""}

STATISTICAL CONSTRAINTS (based on real World Cup data):
- Real World Cups: ~25% draws, ~25% upsets, avg 2.5 goals/match
- Score distribution should roughly follow: 1-0 (18%), 2-1 (14%), 0-0 (8%), 2-0 (10%), 1-1 (10%), 3-1 (7%), other (33%)
- NEVER repeat the same exact score more than twice in this batch
- Upsets must be by narrow margins (1-0, 2-1, 0-1) — never extreme
- Include at least 1 high-scoring game (3+ goals per side combined)

Return ONLY a JSON array, no markdown, no explanation:
[{"id": "match-id", "homeScore": 2, "awayScore": 1}, ...]

Return predictions for ALL ${matches.length} matches.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { temperature: variety.temperature },
    });
    const text = response.text.trim();

    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("Response is not an array");

    // Post-processing: enforce variety in code (safety net)
    parsed = enforceVariety(parsed);

    const results = parsed.map((p) => ({
      id: p.id,
      homeScore: Math.max(0, Math.round(Number(p.homeScore) || 0)),
      awayScore: Math.max(0, Math.round(Number(p.awayScore) || 0)),
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results, persona: variety.persona.name }),
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

// ---- Post-processing: enforce score variety in code ----

function enforceVariety(results) {
  if (results.length <= 2) return results;

  // Count score frequencies
  const scoreCounts = {};
  for (const r of results) {
    const key = `${r.homeScore}-${r.awayScore}`;
    scoreCounts[key] = (scoreCounts[key] || 0) + 1;
  }

  // If any score appears > 2 times, swap some
  const alternatives = [
    [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1],
    [1, 2], [3, 1], [1, 3], [3, 0], [0, 3], [2, 2], [3, 2],
  ];

  for (const r of results) {
    const key = `${r.homeScore}-${r.awayScore}`;
    if (scoreCounts[key] > 2) {
      // Replace with a random alternative that's not overused
      const alt = alternatives.find((a) => {
        const ak = `${a[0]}-${a[1]}`;
        return (scoreCounts[ak] || 0) < 2;
      });
      if (alt) {
        scoreCounts[key]--;
        r.homeScore = alt[0];
        r.awayScore = alt[1];
        const newKey = `${alt[0]}-${alt[1]}`;
        scoreCounts[newKey] = (scoreCounts[newKey] || 0) + 1;
      }
    }
  }

  // Ensure at least some draws exist (~20% for group stage)
  const drawCount = results.filter((r) => r.homeScore === r.awayScore).length;
  const targetDraws = Math.max(1, Math.floor(results.length * 0.18));
  if (drawCount < targetDraws) {
    const drawScores = [[0, 0], [1, 1], [2, 2]];
    let added = 0;
    for (let i = 0; i < results.length && added < targetDraws - drawCount; i++) {
      if (results[i].homeScore !== results[i].awayScore) {
        const ds = drawScores[added % drawScores.length];
        results[i].homeScore = ds[0];
        results[i].awayScore = ds[1];
        added++;
      }
    }
  }

  return results;
}

// ---- Top scorer ----

async function handleTopScorer(apiKey) {
  const seed = Math.floor(Math.random() * 100000);
  const persona = pickRandom(PERSONAS);

  const prompt = `${persona.style}
Random seed: ${seed}

Pick ONE player who could realistically win the FIFA World Cup 2026 Golden Boot.
Don't always pick the most obvious choice. Consider form, team strength, and World Cup history.
Candidates include but are not limited to: Mbappé, Haaland, Vinicius Jr, Kane, Salah, Lewandowski, Lautaro Martínez, Isak, Gyökeres, Son, Osimhen, Yamal, Saka, Álvarez, Retegui, Pulisic, David, Rashford, Morata.

Return ONLY valid JSON, no markdown:
{"name": "Player Name", "team": "Country"}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { temperature: 0.9 + Math.random() * 0.5 },
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
