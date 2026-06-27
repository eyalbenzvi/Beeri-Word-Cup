// Admin-only persistence for the Monte-Carlo scenario run.
//
// The run is a summarized snapshot (see scenarioSim.ScenarioRunResult): for
// ~250 forms and up to 60 champion+runner-up tables the JSON is ~250–300 KB —
// comfortably under Firestore's 1 MB doc limit, but it does scale with form
// count × scenario count, so it is capped at the source (MAX_SCENARIOS).
// It is deliberately NOT wired into the realtime cache/listener set: the
// feature is admin-only and the payload is large, so every page visitor must
// not pay to stream it. Instead the admin tab does a one-off getDoc on open
// and a setDoc after each compute. Stored at gameData/scenarioRun as
// { data: <run> } to match the existing gameData doc envelope. Writes route
// through retryOnPermissionDenied so a freshly-minted/expired admin token
// recovers (the same protection writeGameDoc gives the other gameData docs).

import { getDoc, setDoc } from "firebase/firestore";
import { gameDocRef, safeClone, withTimeout, retryOnPermissionDenied } from "./firestoreClient";
import { requireAdmin } from "./usersRepo";
import { writeAuditLog } from "./audit";
import { captureClientError } from "../sentry";
import type { ScenarioRunResult } from "../utils/scenarioSim";

const SCENARIO_DOC = "scenarioRun";

// Persist a freshly computed run. Admin-gated. Returns true on success.
export async function saveScenarioRun(run: ScenarioRunResult): Promise<boolean> {
  if (!requireAdmin()) return false;
  writeAuditLog("save-scenario-run", {
    simCount: run.meta.simCount,
    formCount: run.meta.formCount,
  });
  try {
    await retryOnPermissionDenied(
      () => setDoc(gameDocRef(SCENARIO_DOC), { data: safeClone(run) }),
      { timeoutMs: 15000 },
    );
    return true;
  } catch (err: any) {
    captureClientError(err, { source: "saveScenarioRun", code: err?.code });
    return false;
  }
}

// Load the last persisted run (or null if none / on error). One-off read.
export async function loadScenarioRun(): Promise<ScenarioRunResult | null> {
  try {
    const snap = await withTimeout(getDoc(gameDocRef(SCENARIO_DOC)), 15000);
    if (!snap.exists()) return null;
    const data = snap.data()?.data;
    return (data as ScenarioRunResult) || null;
  } catch (err: any) {
    captureClientError(err, { source: "loadScenarioRun", code: err?.code });
    return null;
  }
}
