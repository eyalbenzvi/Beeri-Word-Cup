// Server-side scenario recompute (Netlify BACKGROUND function — async, up to
// 15 min). Triggered after every result entry; runs the Monte-Carlo
// simulation (default 100,000 sims, ~3 min) via firebase-admin and writes the
// summarized result to gameData/scenarioRun for ALL users to read.
//
// Concurrency: a single lock doc (gameData/scenarioLock) ensures at most one
// run at a time. A trigger arriving mid-run only flags rerunRequested; the
// active run re-triggers itself once on finish so it converges on the latest
// results without piling up concurrent 3-minute jobs. See scenarioLock.ts.
//
// Bundled by esbuild (netlify.toml), which compiles the imported TS compute.
import admin from "firebase-admin";
import { runScenarioSimulation } from "../../src/utils/scenarioSim";
import { canAcquireLock, shouldRerun, SCENARIO_LOCK_TTL_MS } from "../../src/utils/scenarioLock";

const SIM_COUNT = Number(process.env.SCENARIO_SIM_COUNT) || 100000;

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
    tx.set(ref, { lockedAt: Date.now(), rerunRequested: false });
    return true;
  });
}

// Release the lock; return whether a rerun was requested while we ran.
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

function selfReTrigger() {
  // Background functions are invoked by hitting their URL; this returns 202
  // immediately and the new invocation runs the next pass.
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return;
  // Fire-and-forget; never await (we're about to return).
  fetch(`${base}/.netlify/functions/scenario-recompute-background`, { method: "POST" })
    .catch((err) => console.error("scenario self-retrigger failed:", err?.message || err));
}

export const handler = async () => {
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
      const run = runScenarioSimulation({
        allPredictions,
        results,
        actualBonuses,
        simCount: SIM_COUNT,
      });
      await gameDoc(db, "scenarioRun").set({ data: run });
    } finally {
      const rerun = await releaseLock(db);
      if (rerun) selfReTrigger();
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("scenario-recompute failed:", err?.message || err);
    // Best-effort lock release so a crash can't wedge future runs.
    try { await releaseLock(admin.firestore()); } catch { /* ignore */ }
    return { statusCode: 500, body: "error" };
  }
};
