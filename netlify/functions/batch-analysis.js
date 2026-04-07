import Groq from "groq-sdk";

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
  const temperature = 0.8 + Math.random() * 0.4; // 0.8-1.2 (less wild)
  const seed = Math.floor(Math.random() * 100000);
  return { persona, narrative, temperature, seed };
}

function createGroqClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function callGroq(prompt, temperature = 1.0) {
  const groq = createGroqClient();
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.3-70b-versatile",
    temperature,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  });
  return completion.choices[0]?.message?.content || "";
}

// ---- Handler ----

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

  const { matches, type } = body;

  if (type === "topScorer") {
    return handleTopScorer();
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

  const prompt = `${variety.persona.style}

RANDOM SEED: ${variety.seed}

Predict realistic scores for these FIFA World Cup 2026 matches (${stageInfo}):

${matchList}

RULES:
- Favorites should win MOST matches. Upsets are rare (max 1-2 per group, by narrow margins like 1-0).
- Include 1-2 draws per group (0-0 or 1-1). Draws are common in World Cups.
- Use varied scores — don't repeat the same score more than twice.
- Most matches: 0-3 total goals. Occasionally 4-5 total.
- Strong teams (BRA, FRA, ARG, GER, ESP, ENG, POR, NED, BEL) should generally advance.
- Weaker teams (HAI, CUR, NZL, PAN, CPV, IRQ) rarely win — draws at best.

Return a JSON object with a "results" array:
{"results": [{"id": "match-id", "homeScore": 2, "awayScore": 1}, ...]}

Return predictions for ALL ${matches.length} matches.`;

  try {
    const text = await callGroq(prompt, variety.temperature);
    let parsed = JSON.parse(text);

    // Handle both {results: [...]} and direct array
    let results = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(results)) throw new Error("No results array in response");

    results = enforceVariety(results);

    results = results.map((p) => ({
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
    console.error("Groq batch error:", err?.message || err);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `שגיאת API: ${err?.message || "לא זמין כרגע"}`,
      }),
    };
  }
}

// ---- Post-processing: enforce score variety ----

function enforceVariety(results) {
  if (results.length <= 2) return results;

  const scoreCounts = {};
  for (const r of results) {
    const key = `${r.homeScore}-${r.awayScore}`;
    scoreCounts[key] = (scoreCounts[key] || 0) + 1;
  }

  const alternatives = [
    [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1],
    [1, 2], [3, 1], [1, 3], [3, 0], [0, 3], [2, 2], [3, 2],
  ];

  for (const r of results) {
    const key = `${r.homeScore}-${r.awayScore}`;
    if (scoreCounts[key] > 2) {
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

async function handleTopScorer() {
  const seed = Math.floor(Math.random() * 100000);
  const persona = pickRandom(PERSONAS);

  const prompt = `${persona.style}
Random seed: ${seed}

Pick ONE player who could realistically win the FIFA World Cup 2026 Golden Boot.
Don't always pick the most obvious choice. Consider form, team strength, and World Cup history.
Candidates include but are not limited to: Mbappé, Haaland, Vinicius Jr, Kane, Salah, Lewandowski, Lautaro Martínez, Isak, Gyökeres, Son, Osimhen, Yamal, Saka, Álvarez, Retegui, Pulisic, David, Rashford, Morata.

Return a JSON object:
{"name": "Player Name", "team": "Country"}`;

  try {
    const text = await callGroq(prompt, 0.9 + Math.random() * 0.5);
    const parsed = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: parsed.name, team: parsed.team }),
    };
  } catch (err) {
    console.error("Groq topScorer error:", err?.message || err);
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
