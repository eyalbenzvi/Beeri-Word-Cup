// Server-side scenario recompute (Netlify BACKGROUND function — async, up to
// 15 min). Triggered after every result entry; runs the Monte-Carlo
// simulation (default 35,000 sims, ~3 min) via firebase-admin and writes the
// summarized result to gameData/scenarioRun for ALL users to read.
//
// Concurrency: a single lock doc (gameData/scenarioLock) ensures at most one
// run at a time. A trigger arriving mid-run only flags rerunRequested; the
// active run re-triggers itself once on finish so it converges on the latest
// results without piling up concurrent 3-minute jobs. See scenarioLock.ts.
//
// Bundled by esbuild (netlify.toml), which compiles the imported TS compute.
import admin from "firebase-admin";
import { runScenarioSimulation, fitScenarioRunToDoc } from "../../src/utils/scenarioSim";
import { canAcquireLock, shouldRerun, SCENARIO_LOCK_TTL_MS } from "../../src/utils/scenarioLock";

// Automatic post-result run count. 35k ≈ ~3 min at the current form count,
// comfortably inside the 10-min lock TTL and the 15-min Netlify kill, while
// still statistically ample (Monte-Carlo SE ≈ 1/√N ≈ 0.5%). Override per-env
// with SCENARIO_SIM_COUNT; admins can request a higher count from the UI.
const DEFAULT_SIM_COUNT = Number(process.env.SCENARIO_SIM_COUNT) || 35000;
// Admin recompute requests can override the run count within these bounds.
// Floor keeps the tables statistically meaningful; ceiling keeps a run inside
// Netlify's 15-min background budget.
const MIN_SIM_COUNT = 1000;
const MAX_SIM_COUNT = 200000;

// Parse + clamp an admin-supplied run count from the trigger's POST body.
// Anything missing/invalid falls back to the default so the automatic
// post-result poke (no body) keeps using the 35k default.
function resolveSimCount(event) {
  try {
    if (!event?.body) return DEFAULT_SIM_COUNT;
    const n = Number(JSON.parse(event.body)?.simCount);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_SIM_COUNT;
    return Math.min(MAX_SIM_COUNT, Math.max(MIN_SIM_COUNT, Math.round(n)));
  } catch {
    return DEFAULT_SIM_COUNT;
  }
}

let adminInitialized = false;
function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  // Force REST transport — firebase-admin gRPC can hang on Netlify cold starts.
  try { admin.firestore().settings({ preferRest: true }); } catch { /* already set */ }
  adminInitialized = true;
}

const gameDoc = (db, name) => db.collection("gameData").doc(name);

// Try to take the lock in a transaction. Returns true if this invocation
// should proceed to compute; false if another run is active (we flagged a
// rerun instead).
async function acquireLock(db) {
  const ref = gameDoc(db, "scenarioLock");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lock = snap.exists ? snap.data() : null;
    if (!canAcquireLock(lock, Date.now(), SCENARIO_LOCK_TTL_MS)) {
      tx.set(ref, { rerunRequested: true }, { merge: true });
      return false;
    }
    // A non-null lockedAt that we're allowed to take = a STALE lock (a prior
    // run was killed mid-flight, e.g. hit Netlify's 15-min limit). Surface it.
    if (lock && lock.lockedAt) {
      console.error(
        `scenario-recompute: reclaiming STALE lock (held ${Math.round((Date.now() - lock.lockedAt) / 1000)}s) — a prior run likely crashed/timed out`,
      );
    }
    tx.set(ref, { lockedAt: Date.now(), rerunRequested: false });
    return true;
  });
}

// Release the lock; return whether a rerun was requested while we ran. Runs in
// a transaction, so a concurrent acquireLock that set rerunRequested either
// commits before our get (we see it → rerun) or conflicts with our write
// (Firestore retries our tx, we re-read, we see it) — the flag is never lost.
async function releaseLock(db) {
  const ref = gameDoc(db, "scenarioLock");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rerun = shouldRerun(snap.exists ? snap.data() : null);
    tx.set(ref, { lockedAt: null, rerunRequested: false });
    return rerun;
  });
}

async function readInputs(db) {
  const [predsSnap, resultsSnap, bonusesSnap] = await Promise.all([
    db.collection("predictions").get(),
    gameDoc(db, "matchResults").get(),
    gameDoc(db, "actualBonuses").get(),
  ]);
  const allPredictions = {};
  predsSnap.forEach((d) => { allPredictions[d.id] = d.data(); });
  const results = (resultsSnap.exists && resultsSnap.data()?.data) || {};
  const actualBonuses = (bonusesSnap.exists && bonusesSnap.data()?.data) || { topScorers: [] };
  return { allPredictions, results, actualBonuses };
}

function selfReTrigger(simCount) {
  // Background functions are invoked by hitting their URL; this returns 202
  // immediately and the new invocation runs the next pass. Carry the same run
  // count forward so a queued rerun keeps an admin's chosen precision.
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return;
  // Fire-and-forget; never await (we're about to return).
  fetch(`${base}/.netlify/functions/scenario-recompute-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simCount }),
  }).catch((err) => console.error("scenario self-retrigger failed:", err?.message || err));
}

export const handler = async (event) => {
  const simCount = resolveSimCount(event);
  try {
    initAdmin();
    const db = admin.firestore();

    const proceed = await acquireLock(db);
    if (!proceed) {
      // Another run is active; we only flagged a rerun. Nothing to do.
      return { statusCode: 200, body: "queued" };
    }

    try {
      const { allPredictions, results, actualBonuses } = await readInputs(db);
      const full = runScenarioSimulation({
        allPredictions,
        results,
        actualBonuses,
        simCount,
      });
      // Guard Firestore's 1 MiB doc limit: trim the least-likely finals until
      // the run fits. Loud if anything was dropped (a scaling signal).
      const { run, trimmed } = fitScenarioRunToDoc(full);
      if (trimmed > 0) {
        console.error(`scenario-recompute: trimmed ${trimmed} scenario(s) to fit the 1MB doc limit (formCount=${run.meta.formCount})`);
      }
      await gameDoc(db, "scenarioRun").set({ data: run });
    } finally {
      const rerun = await releaseLock(db);
      if (rerun) selfReTrigger(simCount);
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("scenario-recompute failed:", err?.message || err);
    // Best-effort lock release so a crash can't wedge future runs.
    try { await releaseLock(admin.firestore()); } catch { /* ignore */ }
    return { statusCode: 500, body: "error" };
  }
};
