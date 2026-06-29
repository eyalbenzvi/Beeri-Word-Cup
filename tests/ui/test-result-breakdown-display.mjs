// Static audit: the knockout ET / penalty breakdown is shown the SAME way on
// every result surface (via the one shared component), the legacy hardcoded
// "penalty" snippets are gone, the data model + AI prompt + live card were all
// updated, and the prediction surfaces use neutral wording. Catches "forgot to
// wire surface X" regressions across the site's many result displays.

import fs from "node:fs";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== RESULT BREAKDOWN DISPLAY AUDIT ===\n");

// --- Shared component ---
assert(existsMigratedSrc("src/components/ResultBreakdown.jsx"), "ResultBreakdown component exists");
const rb = readMigratedSrc("src/components/ResultBreakdown.jsx");
assert(/getResultDecision/.test(rb), "ResultBreakdown derives from getResultDecision");
assert(/from "\.\/Score"/.test(rb), "ResultBreakdown renders scores via <Score> (RTL-safe)");
for (const v of ["full", "inline", "badge", "line"]) {
  assert(rb.includes(`"${v}"`), `ResultBreakdown supports the ${v} variant`);
}
assert(/aria-label/.test(rb), "ResultBreakdown sets an aria-label summary");

// --- Shared data module ---
const mod = readMigratedSrc("src/utils/resultBreakdown.js");
assert(/export function buildResultRecord/.test(mod), "resultBreakdown exports buildResultRecord");
assert(/export function validateResultBreakdown/.test(mod), "resultBreakdown exports validateResultBreakdown");
assert(/export function getResultDecision/.test(mod), "resultBreakdown exports getResultDecision");

// --- Type extended ---
const types = readMigratedSrc("src/types.d.ts");
for (const f of ["decidedBy", "etHomeScore", "penHomeScore"]) {
  assert(types.includes(f), `MatchResult type carries ${f}`);
}

// --- Centralised copy ---
const msgs = readMigratedSrc("src/constants/messages.js");
assert(/export const RESULT/.test(msgs), "messages exports RESULT block");
for (const k of ["afterET", "penalties", "advanced", "predictedAdvancing"]) {
  assert(new RegExp(`${k}:`).test(msgs), `RESULT.${k} defined`);
}
assert(/penalties:\s*"פנדלים"/.test(msgs), "LIVE.penalties chip defined");

// --- Result surfaces wire the shared component, and drop the old snippets ---
const results = readMigratedSrc("src/pages/Results.jsx");
assert(/ResultBreakdown/.test(results), "Results.tsx uses ResultBreakdown");
assert(!results.includes("בעיטות הכרעה:"), "Results.tsx no longer hardcodes 'בעיטות הכרעה:'");

const digest = readMigratedSrc("src/components/MatchDigest.jsx");
assert(/ResultBreakdown/.test(digest), "MatchDigest (blog) uses ResultBreakdown");
assert(!digest.includes("(פנדלים:"), "MatchDigest no longer hardcodes '(פנדלים:'");

const bracket = readMigratedSrc("src/components/BracketView.jsx");
assert(/ResultBreakdown/.test(bracket), "BracketView uses ResultBreakdown");

const recent = readMigratedSrc("src/components/RecentlyFinishedMatches.jsx");
assert(/ResultBreakdown/.test(recent), "RecentlyFinishedMatches uses ResultBreakdown");

// --- Live card: penalties status + ticker ---
const liveNow = readMigratedSrc("src/utils/liveNow.js");
assert(/"pens"/.test(liveNow) && /PENALTY_SHOOTOUT/.test(liveNow), "liveNow distinguishes a penalties status");
const liveCard = readMigratedSrc("src/components/LiveNowCard.jsx");
assert(/kind === "pens"/.test(liveCard), "LiveNowCard renders the penalties chip");
assert(/LIVE\.penalties/.test(liveCard), "LiveNowCard shows the penalty ticker via LIVE.penalties");

// --- Prediction surfaces use neutral wording (user predicts WHO advances) ---
const formMatches = readMigratedSrc("src/components/FormMatchesView.jsx");
assert(/predictedAdvancing/.test(formMatches), "FormMatchesView uses RESULT.predictedAdvancing");
assert(!formMatches.includes("בעיטות הכרעה:"), "FormMatchesView prediction wording no longer says 'בעיטות הכרעה:'");

// --- Admin entry uses the shared serializer + validator ---
const admin = readMigratedSrc("src/components/AdminResultsTab.jsx");
assert(/buildResultRecord/.test(admin) && /validateResultBreakdown/.test(admin), "AdminResultsTab builds + validates via the shared module");
assert(/KnockoutTieEditor/.test(admin), "AdminResultsTab has the knockout tie editor");
assert(/scoreChanged/.test(admin) && /etHomeScore: null/.test(admin), "AdminResultsTab clears stale ET/penalty breakdown when a tie's 90' score is re-edited");

// --- AI prompt is fed the decision context (server .js, read directly) ---
const ai = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/summary-ai.js", "utf8");
for (const f of ["decidedBy", "extraTimeScore", "penaltyScore", "advancingTeam"]) {
  assert(ai.includes(f), `summary-ai facts include ${f}`);
}

// --- auto-fill writes via the shared canonical serializer ---
const af = fs.readFileSync("/home/user/Beeri-World-Cup/netlify/functions/auto-fill-match-result.js", "utf8");
assert(af.includes("buildResultRecord") && af.includes("validateResultBreakdown"), "auto-fill writes via shared serializer + validator");

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.error("\nFailures:\n  - " + failures.join("\n  - ")); process.exit(1); }
