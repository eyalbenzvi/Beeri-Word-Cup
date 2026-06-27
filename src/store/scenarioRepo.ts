// Admin-only persistence for the Monte-Carlo scenario run.
//
// The run is a ~100 KB summarized snapshot (see scenarioSim.ScenarioRunResult).
// It is deliberately NOT wired into the realtime cache/listener set: the
// feature is admin-only and the payload is large, so every page visitor must
// not pay to stream it. Instead the admin tab does a one-off getDoc on open
// and a setDoc after each compute. Stored at gameData/scenarioRun as
// { data: <run> } to match the existing gameData doc envelope.

import { getDoc, setDoc } from "firebase/firestore";
import { gameDocRef, safeClone, withTimeout } from "./firestoreClient";
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
    await withTimeout(
      setDoc(gameDocRef(SCENARIO_DOC), { data: safeClone(run) }),
      15000,
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
