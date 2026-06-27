// Client access to the scenario run.
//
// The run is now COMPUTED SERVER-SIDE (netlify/functions/scenario-recompute-
// background) after every result entry and written to gameData/scenarioRun by
// the Admin SDK. The client only READS it (any authenticated user) and POKES
// the recompute after an admin writes a result. It is deliberately not wired
// into the realtime cache: the payload is large and only the "data" tab needs
// it, so the tab does a one-off getDoc.

import { getDoc } from "firebase/firestore";
import { gameDocRef, withTimeout } from "./firestoreClient";
import { captureClientError } from "../sentry";
import type { ScenarioRunResult } from "../utils/scenarioSim";

const SCENARIO_DOC = "scenarioRun";
const RECOMPUTE_FN = "/.netlify/functions/scenario-recompute-background";

// Load the latest server-computed run (or null if none / on error). One-off read.
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

// Fire-and-forget poke to recompute scenarios after a result changes. The
// background function self-serialises via a lock, so spamming this is safe
// (at most one run at a time + one queued rerun). Never throws.
export function triggerScenarioRecompute(): void {
  try {
    fetch(RECOMPUTE_FN, { method: "POST" }).catch(() => {});
  } catch {
    /* fetch unavailable (e.g. SSR/test) — ignore */
  }
}
