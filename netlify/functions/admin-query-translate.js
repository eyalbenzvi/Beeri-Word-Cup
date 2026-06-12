// Translates a Hebrew admin question + resolvedEntities into a QuerySpec JSON
// using Groq llama-3.3-70b-versatile. Auth pattern cloned from match-analysis.js.
//
// IMPORTANT: this function's job is *only* to call the LLM. It does not run
// the spec — the browser does, against its already-cached form data.

import Groq from "groq-sdk";
import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";

let adminInitialized = false;
function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  // Force Firestore REST transport (firebase-admin gRPC hangs on Netlify cold
  // starts -> 504s under load). try/catch so a re-init can never throw.
  try { admin.firestore().settings({ preferRest: true }); } catch { /* already set */ }
  adminInitialized = true;
}

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173"
).split(",");

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

const SYSTEM_PROMPT_TEMPLATE = `You are a translator. You convert a Hebrew admin question about prediction forms into a strict JSON QuerySpec.
Reply with JSON only — no prose, no markdown.

Schema:
\`\`\`ts
type Stage = "groups" | "R32" | "R16" | "QF" | "SF" | "F" | "ALL";
type ScoreComponent = "teams" | "matchupsBySlot" | "pairings" | "scores" | "outcomes";

type FieldRef =
  | "formId" | "formName" | "ownerName" | "status"
  | "champion" | "topScorer" | "correctChampion" | "correctTopScorer" | "totalPoints"
  | { stage: Stage; teams: true }
  | { stage: Stage; metric: ScoreComponent }
  | { match: string; field: "home"|"away"|"homeScore"|"awayScore"|"advancingTeam"|"outcome"|"correctScore"|"correctOutcome"|"wrongMatchup" };

type Predicate =
  | { op: "and"|"or"; args: Predicate[] }
  | { op: "not"; arg: Predicate }
  | { op: "cmp"; field: FieldRef; operator: "eq"|"ne"|"gt"|"gte"|"lt"|"lte"; value: any }
  | { op: "in"; field: FieldRef; values: any[]; negated?: boolean }
  | { op: "contains"; field: FieldRef; value: any; negated?: boolean }
  | { op: "containsAtLeast"; field: FieldRef; values: any[]; n: number }
  | { op: "isNull"; field: FieldRef; negated?: boolean }
  | { op: "matchup"; teams: [string,string]; ordered?: boolean; stages?: Stage[]; matchId?: string }
  | { op: "exactScore"; matchId: string; teams?: [string,string]; homeScore: number; awayScore: number }
  | { op: "winnerAt"; matchId: string; team: string }
  | { op: "teamReachedStage"; team: string; stage: Stage };

type ScoreExpr =
  | { kind: "totalPoints" }
  | { kind: "scoreComponent"; component: ScoreComponent; stage?: Stage }
  | { kind: "fieldValue"; field: FieldRef };

type Aggregate =
  | { kind: "count" }
  | { kind: "list"; columns?: FieldRef[]; sort?: {by: ScoreExpr; order?: "asc"|"desc"}[]; limit?: number }
  | { kind: "rank"; by: ScoreExpr; limit?: number; order?: "desc"|"asc" }
  | { kind: "groupBy"; key: { field: FieldRef } | { kind: "matchPrediction"; matchId: string; aspect: "outcome"|"advancingTeam"|"exactScore" }; then: { kind: "count" } | { kind: "avg"|"sum"; of: ScoreExpr } };

type QuerySpec = {
  scope?: { includeDrafts?: boolean };
  filter?: Predicate;
  aggregate: Aggregate;
};
\`\`\`

Output a JSON object with EXACTLY one of these shapes:
- { "spec": QuerySpec } — when the question is unambiguous.
- { "clarifyingQuestion": string } — when truly ambiguous.

Rules:
1. Prefer GUESSING over asking. Use clarifyingQuestion only when (a) a referenced entity is unresolved, or (b) two incompatible aggregates are requested.
2. Stage scope: when no stage is named, default to stage="ALL" for scoreComponent.
3. "negated" is the canonical way to express not-in/not-contains/not-isNull. NEVER wrap them in {op:"not"}.
4. matchup.ordered defaults to false (most Hebrew speakers don't distinguish home/away).
5. Treat \`[[team:CODE]]\` as the team code (CODE). Same for \`[[stage:CODE]]\`, \`[[form:ID]]\`.
6. When the question contains numbers, decide if each is a comparison threshold or a count predicate based on context.

EXAMPLES:

Q: "כמה טפסים ניחשו ש-[[team:ARG]] תזכה?"
A: {"spec":{"filter":{"op":"cmp","field":"champion","operator":"eq","value":"ARG"},"aggregate":{"kind":"count"}}}

Q: "10 הטפסים המובילים בניקוד"
A: {"spec":{"aggregate":{"kind":"rank","by":{"kind":"totalPoints"},"limit":10,"order":"desc"}}}

Q: "התפלגות ניחושי האלוף"
A: {"spec":{"aggregate":{"kind":"groupBy","key":{"field":"champion"},"then":{"kind":"count"}}}}

Q: "מי ניחש את הזיווג [[team:ARG]] – [[team:BRA]] ב-[[stage:QF]]?"
A: {"spec":{"filter":{"op":"matchup","teams":["ARG","BRA"],"stages":["QF"],"ordered":false},"aggregate":{"kind":"list"}}}

Q: "מי ניחש [[team:ARG]] – [[team:BRA]] עם תוצאה 2:1 ב-QF-1?"
A: {"spec":{"filter":{"op":"exactScore","matchId":"QF-1","teams":["ARG","BRA"],"homeScore":2,"awayScore":1},"aggregate":{"kind":"list"}}}

Q: "טפסים עם יותר מ-100 נקודות שלא ניחשו [[team:BRA]] כאלופה"
A: {"spec":{"filter":{"op":"and","args":[{"op":"cmp","field":"totalPoints","operator":"gt","value":100},{"op":"cmp","field":"champion","operator":"ne","value":"BRA"}]},"aggregate":{"kind":"list"}}}

Q: "מי ניחש לפחות 3 קבוצות שעלו לרבע הגמר"
A: {"spec":{"filter":{"op":"cmp","field":{"stage":"QF","metric":"teams"},"operator":"gte","value":3},"aggregate":{"kind":"list"}}}

Q: "דרג את הטפסים לפי תוצאות מדויקות בכל השלבים"
A: {"spec":{"aggregate":{"kind":"rank","by":{"kind":"scoreComponent","component":"scores","stage":"ALL"},"limit":10}}}

Q: "כמה ניחשו תיקו במשחק group-A-1"
A: {"spec":{"filter":{"op":"cmp","field":{"match":"group-A-1","field":"outcome"},"operator":"eq","value":"draw"},"aggregate":{"kind":"count"}}}

Q: "מי ניחש [[stage:QF]] בלי [[team:GER]]?"
A: {"spec":{"filter":{"op":"not","arg":{"op":"teamReachedStage","team":"GER","stage":"QF"}},"aggregate":{"kind":"list"}}}

Q: "מי ניבא שלפחות 5 מתוך הקבוצות [[team:ARG]] [[team:BRA]] [[team:FRA]] [[team:GER]] [[team:ESP]] יעלו לחצי הגמר"
A: {"spec":{"filter":{"op":"containsAtLeast","field":{"stage":"SF","teams":true},"values":["ARG","BRA","FRA","GER","ESP"],"n":5},"aggregate":{"kind":"count"}}}

Q: "מי ניחש את [[team:ARG]] או את [[team:BRA]] כאלופה?"
A: {"clarifyingQuestion":"לחפש טפסים שניחשו את שני האלופים האלה, או טפסים שניחשו לפחות אחד מהם?"}`;

async function adminQueryTranslateHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }
  if (!process.env.GROQ_API_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing server configuration" }),
    };
  }

  const authHeader =
    event.headers.authorization || event.headers.Authorization || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Missing authorization token" }),
    };
  }
  try {
    initAdmin();
    await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error("ID token verification failed:", err?.message || err);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Invalid authorization token" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const { question, resolvedEntities, retryError } = body || {};
  if (typeof question !== "string" || !question.trim()) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing question" }),
    };
  }
  if (question.length > 500) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Question too long (max 500 chars)" }),
    };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT_TEMPLATE },
    {
      role: "user",
      content: JSON.stringify({ question, resolvedEntities: resolvedEntities || {} }),
    },
  ];
  // On retry, append the assistant's prior reply + the validation error so the
  // model conditions on the failure.
  if (retryError && typeof retryError === "string") {
    messages.push({
      role: "assistant",
      content: retryError.split("\n--RETRY--\n")[0] || "",
    });
    messages.push({
      role: "user",
      content: `Previous output failed validation: ${retryError}. Please reply with corrected JSON only.`,
    });
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: retryError ? 0.3 : 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content || "";
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ raw: text }),
    };
  } catch (err) {
    console.error("Groq API error:", err?.message || err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "שירות התרגום לא זמין כרגע. נסה שוב בעוד מספר רגעים",
      }),
    };
  }
}

export const handler = withSentry(
  adminQueryTranslateHandler,
  "admin-query-translate",
);
