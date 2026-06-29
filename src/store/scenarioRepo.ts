// Client access to the scenario run.
//
// The run is now COMPUTED SERVER-SIDE (netlify/functions/scenario-recompute-
// background) after every result entry and written to gameData/scenarioRun by
// the Admin SDK. The client only READS it (any authenticated user) and POKES
// the recompute after an admin writes a result. It is deliberately not wired
// into the realtime cache: the payload is large and only the "data" tab needs
// it, so the tab does a one-off getDoc.

import { getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { gameDocRef, withTimeout, safeClone, retryOnPermissionDenied } from "./firestoreClient";
import { requireAdmin } from "./usersRepo";
import { writeAuditLog } from "./audit";
import { captureClientError } from "../sentry";
import { fitScenarioRunToDoc } from "../utils/scenarioSim";
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

// Live subscription so the "נתונים" tab auto-updates the moment the server
// finishes a recompute (no stale numbers after a result). Returns unsubscribe.
export function subscribeScenarioRun(
  onData: (run: ScenarioRunResult | null) => void,
  onError?: (err: any) => void,
): () => void {
  return onSnapshot(
    gameDocRef(SCENARIO_DOC),
    (snap) => onData(snap.exists() ? ((snap.data()?.data as ScenarioRunResult) ?? null) : null),
    (err) => {
      captureClientError(err, { source: "subscribeScenarioRun", code: err?.code });
      onError?.(err);
    },
  );
}

// Persist a run computed IN-BROWSER (the admin "local" recompute fallback).
// Admin-gated; the rules allow an admin client to write gameData/scenarioRun.
// Writes the SAME { data: run } envelope the background function uses, so every
// reader's subscription refreshes identically regardless of who computed it.
// Applies the same 1 MB doc-fit trim as the server before writing. Returns true
// on success; surfaces failure so the admin isn't told a 1–2 min run was saved
// when it wasn't. Routes through retryOnPermissionDenied so a freshly-minted /
// expired admin token recovers, exactly like the other gameData writes.
export async function saveScenarioRun(run: ScenarioRunResult): Promise<boolean> {
  if (!requireAdmin()) return false;
  const { run: fitted, trimmed } = fitScenarioRunToDoc(run);
  writeAuditLog("save-scenario-run-local", {
    simCount: fitted.meta.simCount,
    formCount: fitted.meta.formCount,
    trimmed,
  });
  try {
    await retryOnPermissionDenied(
      () => setDoc(gameDocRef(SCENARIO_DOC), { data: safeClone(fitted) }),
      { timeoutMs: 15000 },
    );
    return true;
  } catch (err: any) {
    captureClientError(err, { source: "saveScenarioRun", code: err?.code });
    return false;
  }
}

// Fire-and-forget poke to recompute scenarios after a result changes. The
// background function self-serialises via a lock, so spamming this is safe
// (at most one run at a time + one queued rerun). Never throws.
//
// `simCount` (admin-only override): when provided, the server runs that many
// Monte-Carlo simulations instead of the default 100k. The automatic
// post-result poke omits it so it keeps using the default.
export function triggerScenarioRecompute(simCount?: number): void {
  try {
    const body =
      simCount && Number.isFinite(simCount)
        ? JSON.stringify({ simCount })
        : undefined;
    fetch(RECOMPUTE_FN, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
    }).catch(() => {});
  } catch {
    /* fetch unavailable (e.g. SSR/test) — ignore */
  }
}
