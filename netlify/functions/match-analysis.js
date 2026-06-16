import Groq from "groq-sdk";
import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";
import { buildCorsHeaders } from "./_lib/cors.js";

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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173").split(",");

function getCorsHeaders(event) {
  return buildCorsHeaders(event, { allowedOrigins: ALLOWED_ORIGINS });
}

async function matchAnalysisHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  if (!process.env.GROQ_API_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing server configuration" }),
    };
  }

  // Require a valid Firebase ID token — prevents anonymous abuse of the GROQ quota.
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Missing authorization token" }) };
  }
  try {
    initAdmin();
    await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error("ID token verification failed:", err?.message || err);
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid authorization token" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { homeTeam, awayTeam, stage, group } = body;
  if (!homeTeam || !awayTeam || !stage) {
    return {
      statusCode: 400,
      headers,
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
        ...headers,
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
      headers,
      body: JSON.stringify({
        error: "שירות הניתוח לא זמין כרגע. נסה שוב בעוד מספר רגעים",
      }),
    };
  }
}

export const handler = withSentry(matchAnalysisHandler, "match-analysis");
