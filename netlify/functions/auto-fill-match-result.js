// Auto-fill a real match result, server-side and authoritatively.
//
// The client only sends { matchId }. This function is the SOLE authority for:
//   - kickoff time + the 1h55m-since-kickoff gate,
//   - the expected team codes (group: from the schedule; knockout: derived
//     from the canonical bracket over the existing results),
//   - whether a result already exists / is admin-owned,
//   - the score values: fetched from ESPN (real-time PRIMARY) with a
//     football-data FALLBACK, always recording the END-OF-90-MINUTES score.
//
// It writes via firebase-admin (bypassing security rules); matchResults write
// rules stay isAdmin-only. Every attempt is audited.
//
// Style mirrors match-analysis.js: withSentry wrapper, CORS via ALLOWED_ORIGINS,
// Firebase ID-token verification, JSON in/out.

import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";
import { buildCorsHeaders } from "./_lib/cors.js";
import { decideSingleSource } from "./_sources/consensus.js";
import { fetchMatchResult as fetchEspn } from "./_sources/espnResult.js";
import { fetchMatchResult as fetchFootballData } from "./_sources/footballData.js";
import { getMatchById } from "../../src/data/matches.js";
import { getMatchKickoffUTC } from "../../src/utils/matchTime.js";
import { calcBracketTeams } from "../../src/utils/bracket.js";

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

// Minimum age (since kickoff) before we attempt to record an official result.
// 1h55m: a regular-time match is ~1h50m of wall-clock (90' + 15' HT + stoppage),
// so this opens the gate right as a regular-time match ends without firing
// while it is still live. Must stay in lockstep with the client gate in
// src/store/autoFill.ts (a looser client gate just gets 425 here).
const MIN_MATCH_AGE_MS = 115 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;

// In-memory per-uid rate limit: 30 requests / minute. Approximate across warm
// instances (acceptable per spec); the per-match Firestore lock is the real
// concurrency guard.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map(); // uid -> number[] (timestamps)

function rateLimited(uid) {
  const now = Date.now();
  const arr = (rateBuckets.get(uid) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(uid, arr);
    return true;
  }
  arr.push(now);
  rateBuckets.set(uid, arr);
  return false;
}

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

// Compact, audit-friendly view of a source result.
function sourceSummary(r) {
  if (!r) return { name: null, status: "missing" };
  if (r.error) return { name: r.name, status: "error", errorMessage: r.reason || null };
  return {
    name: r.name,
    status: r.finished ? "finished" : "not-finished",
    home: r.home90 ?? null,
    away: r.away90 ?? null,
    advancing: r.advancingTeam ?? null,
  };
}

async function writeAuditLog(db, entry) {
  try {
    await db.collection("autoFillLog").doc().set({
      ...entry,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("autoFillLog write failed:", err?.message || err);
  }
}

// Acquire a per-match lock via transaction. Returns true if held by us.
async function acquireLock(db, matchId, uid) {
  const ref = db.collection("autoFillLocks").doc(matchId);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : 0;
      if (data.heldBy && data.heldBy !== uid && expiresAt > now) {
        return false; // someone else holds an unexpired lock
      }
    }
    tx.set(ref, { heldBy: uid, expiresAt: now + LOCK_TTL_MS });
    return true;
  });
}

async function releaseLock(db, matchId, uid) {
  try {
    const ref = db.collection("autoFillLocks").doc(matchId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && (snap.data() || {}).heldBy === uid) {
        tx.delete(ref);
      }
    });
  } catch (err) {
    console.error("releaseLock failed:", err?.message || err);
  }
}

async function autoFillHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") {
    return json(405, headers, { error: "Method Not Allowed" });
  }
  // Hard kill switch: set AUTO_FILL_DISABLED=true in Netlify to neutralize the
  // feature instantly, BEFORE any Firebase/Firestore work. Costs nothing and
  // guarantees auto-fill cannot touch Firestore (use during an incident).
  if (process.env.AUTO_FILL_DISABLED === "true") {
    return json(503, headers, { error: "Auto-fill disabled" });
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return json(500, headers, { error: "Missing server configuration" });
  }

  // --- Auth: any signed-in user (admin or not). Reject anonymous. ---
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) return json(401, headers, { error: "Missing authorization token" });

  let uid;
  try {
    initAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    console.error("ID token verification failed:", err?.message || err);
    return json(401, headers, { error: "Invalid authorization token" });
  }

  // --- Rate limit per uid ---
  if (rateLimited(uid)) {
    return json(429, headers, { error: "Too many requests" });
  }

  const db = admin.firestore();

  // --- Kill switch ---
  try {
    const settingsSnap = await db.collection("gameData").doc("settings").get();
    const settings = (settingsSnap.exists ? settingsSnap.data()?.data : null) || {};
    if (settings.autoFillEnabled === false) {
      return json(503, headers, { error: "Auto-fill disabled" });
    }
  } catch (err) {
    console.error("settings read failed:", err?.message || err);
    return json(503, headers, { error: "Service unavailable" });
  }

  // --- Body ---
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, headers, { error: "Invalid JSON" });
  }
  const matchId = typeof body?.matchId === "string" ? body.matchId : null;
  if (!matchId) return json(400, headers, { error: "Missing matchId" });

  const match = getMatchById(matchId);
  if (!match) return json(400, headers, { error: "Unknown matchId" });

  // --- Kickoff + 1h55m gate (server-authoritative) ---
  const kickoff = getMatchKickoffUTC(match);
  if (kickoff == null) {
    return json(400, headers, { error: "Cannot determine kickoff time" });
  }
  if (Date.now() < kickoff + MIN_MATCH_AGE_MS) {
    return json(425, headers, { error: "Too early" });
  }
  const kickoffIso = new Date(kickoff).toISOString();
  const isKnockout = match.stage !== "group";

  // --- Read existing results; resolve expected teams ---
  let resultsMap = {};
  try {
    const mrSnap = await db.collection("gameData").doc("matchResults").get();
    resultsMap = (mrSnap.exists ? mrSnap.data()?.data : null) || {};
  } catch (err) {
    console.error("matchResults read failed:", err?.message || err);
    return json(503, headers, { error: "Service unavailable" });
  }

  const existing = resultsMap[matchId];
  // Existence check, then admin-ownership guard (never overwrite admin), then
  // already-played guard.
  if (existing?.source === "admin") {
    return json(409, headers, { error: "Result is admin-owned" });
  }
  if (existing?.played) {
    return json(200, headers, { ok: true, decision: "already-filled" });
  }

  let homeTeam = null;
  let awayTeam = null;
  let group = null;
  if (isKnockout) {
    const bracket = calcBracketTeams(resultsMap);
    const slot = bracket[matchId];
    if (!slot?.home || !slot?.away) {
      // Bracket not resolvable yet (earlier rounds incomplete) -> can't verify
      // the participants. Don't write.
      await writeAuditLog(db, {
        matchId, uid, decision: "no-teams", sources: [],
        errorMessage: "knockout participants not resolvable",
      });
      return json(202, headers, { ok: false, decision: "no-teams" });
    }
    homeTeam = slot.home;
    awayTeam = slot.away;
  } else {
    homeTeam = match.homeTeam;
    awayTeam = match.awayTeam;
    group = match.group || null;
  }

  // --- Per-match lock ---
  let locked = false;
  try {
    locked = await acquireLock(db, matchId, uid);
  } catch (err) {
    console.error("acquireLock failed:", err?.message || err);
    return json(503, headers, { error: "Service unavailable" });
  }
  if (!locked) return json(409, headers, { error: "Another fill is in progress" });

  try {
    const fetchArgs = { fifaMatch: match.fifaMatch, homeTeam, awayTeam, kickoffIso };
    const expected = { matchId, isKnockout, homeTeam, awayTeam };
    // PRIMARY = ESPN (real-time). FALLBACK = football-data (delayed free tier).
    // AUTO_FILL_SOURCE env forces one: "espn" / "fd" / unset = ESPN then FD.
    const srcEnv = process.env.AUTO_FILL_SOURCE;
    const tryEspn = srcEnv !== "fd";
    const tryFd = srcEnv !== "espn";

    let result = null;
    let consensus = null;
    const sources = [];

    if (tryEspn) {
      result = await fetchEspn(fetchArgs)
        .catch((e) => ({ name: "espn", error: true, reason: e?.message }));
      consensus = decideSingleSource(expected, result);
      sources.push(sourceSummary(result));
    }
    // Fall back to football-data when ESPN is unusable — UNREACHABLE (error),
    // FINISHED-BUT-CANNOT-ISOLATE-90' (ambiguous; e.g. extra time without a
    // per-period breakdown), or the fixture is ABSENT from ESPN's feed
    // (notFound -> a coverage gap, e.g. a renamed league slug). A genuine
    // "not-finished" verdict for a fixture ESPN *does* list is real-time truth
    // and does NOT trigger the (slower) FD call. Also the sole path when
    // AUTO_FILL_SOURCE === "fd".
    if (
      tryFd &&
      (!consensus ||
        consensus.decision === "error" ||
        consensus.decision === "ambiguous" ||
        result?.notFound === true)
    ) {
      const fd = await fetchFootballData(fetchArgs)
        .catch((e) => ({ name: "football-data", error: true, reason: e?.message }));
      const fdConsensus = decideSingleSource(expected, fd);
      sources.push(sourceSummary(fd));
      // Adopt FD when ESPN gave nothing usable, or FD actually resolved the
      // result (e.g. isolated the 90' score ESPN couldn't). Otherwise keep
      // ESPN's verdict (it's the real-time primary).
      if (!result || consensus.decision === "error" || fdConsensus.decision === "agreed") {
        result = fd;
        consensus = fdConsensus;
      }
    }

    if (consensus.decision !== "agreed") {
      // Don't log the common, benign "not-finished" case — before a match ends
      // every trigger would otherwise write an audit doc and burn Firestore
      // write quota. Only record outcomes worth investigating.
      if (consensus.decision !== "not-finished") {
        await writeAuditLog(db, {
          matchId, uid, decision: consensus.decision, sources,
          errorMessage: consensus.reason || null,
        });
      }
      // Source unreachable -> 502; otherwise 202 (pending/ambiguous/disagree).
      const code = consensus.decision === "error" ? 502 : 202;
      return json(code, headers, { ok: false, decision: consensus.decision });
    }

    // --- Validate before writing (defense-in-depth) ---
    const { homeScore, awayScore } = consensus;
    const scoreOk = Number.isInteger(homeScore) && Number.isInteger(awayScore) &&
      homeScore >= 0 && homeScore <= 20 && awayScore >= 0 && awayScore <= 20;
    const advancingTeam = consensus.advancingTeam || null;
    const advancingOk = advancingTeam == null ||
      advancingTeam === homeTeam || advancingTeam === awayTeam;
    if (!scoreOk || !advancingOk) {
      await writeAuditLog(db, {
        matchId, uid, decision: "ambiguous", sources,
        errorMessage: "post-consensus validation failed",
      });
      return json(202, headers, { ok: false, decision: "ambiguous" });
    }

    const nowIso = new Date().toISOString();
    const writeObj = {
      homeTeam,
      awayTeam,
      stage: match.stage || "group",
      group,
      homeScore,
      awayScore,
      played: true,
      advancingTeam,
      source: "auto",
      // ISO strings (not serverTimestamp): the client rewrites the whole
      // matchResults map through JSON-clone on later admin edits, which would
      // corrupt a Firestore Timestamp object. The rest of the codebase stores
      // ISO timestamps too.
      autoFilledAt: nowIso,
      // PII: gameData/matchResults is readable by every authenticated user.
      // A phone user's uid is "phone_05XXXXXXXX" (a phone number), so writing
      // the raw uid here would leak PII to all users — exactly the class of
      // leak the project's PII migration is closing. Redact phone uids; the
      // full uid is still recorded in the admin-only autoFillLog audit.
      autoFilledBy: uid.startsWith("phone_") ? "phone_user" : uid,
      sourcesUsed: [result.name],
      updatedAt: nowIso,
    };

    // Merge only this matchId into gameData/matchResults.data.
    await db.collection("gameData").doc("matchResults").set(
      { data: { [matchId]: writeObj } },
      { merge: true },
    );

    await writeAuditLog(db, { matchId, uid, decision: "agreed", sources });
    return json(200, headers, { ok: true, decision: "agreed" });
  } catch (err) {
    console.error("auto-fill failed:", err?.message || err);
    await writeAuditLog(db, {
      matchId, uid, decision: "error", sources: [],
      errorMessage: err?.message || String(err),
    });
    return json(500, headers, { error: "Internal error" });
  } finally {
    await releaseLock(db, matchId, uid);
  }
}

export const handler = withSentry(autoFillHandler, "auto-fill-match-result");
