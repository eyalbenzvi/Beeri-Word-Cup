// Regression tests for the auto-fill client trigger wiring.
//
// 1. Behaviour of the dependency-free indirection (src/utils/autoFillTrigger).
// 2. Static assertions that the trigger is wired into the natural computation
//    sites and that the store + function + rules carry the auto-fill pieces,
//    so a future refactor can't silently drop them.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  registerAutoFillTrigger,
  triggerAutoFillCheck,
} from "../../src/utils/autoFillTrigger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
function read(p) { return fs.readFileSync(resolve(ROOT, p), "utf8"); }

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== AUTO-FILL TRIGGER WIRING TESTS ===\n");

// --- 1. Indirection behaviour ---
{
  // No-op before registration: must not throw.
  let threw = false;
  try { triggerAutoFillCheck(); } catch { threw = true; }
  assert(!threw, "triggerAutoFillCheck is a safe no-op before registration");

  let calls = 0;
  registerAutoFillTrigger(() => { calls++; });
  triggerAutoFillCheck();
  assert(calls === 1, "registered trigger is invoked");

  // A throwing trigger must be swallowed (never break the computation).
  registerAutoFillTrigger(() => { throw new Error("boom"); });
  let threw2 = false;
  try { triggerAutoFillCheck(); } catch { threw2 = true; }
  assert(!threw2, "throwing trigger is swallowed");

  // Reset back to a no-op so we don't leak state to other modules.
  registerAutoFillTrigger(() => {});
}

// --- 2. Compute-site wiring ---
{
  const scoring = read("src/utils/scoring.ts");
  assert(/import\s*\{\s*triggerAutoFillCheck\s*\}/.test(scoring), "scoring imports triggerAutoFillCheck");
  assert(scoring.includes("triggerAutoFillCheck()"), "scoring calls triggerAutoFillCheck()");

  const bracket = read("src/utils/bracket.ts");
  assert(/import\s*\{\s*triggerAutoFillCheck\s*\}/.test(bracket), "bracket imports triggerAutoFillCheck");
  assert(bracket.includes("triggerAutoFillCheck()"), "bracket calls triggerAutoFillCheck()");

  const listeners = read("src/store/listeners.ts");
  assert(listeners.includes("maybeTriggerAutoFill"), "listeners reference maybeTriggerAutoFill");
  assert(/key === "matchResults"/.test(listeners), "listeners guard on matchResults snapshot");

  const index = read("src/store/index.ts");
  assert(index.includes("registerAutoFillTrigger(maybeTriggerAutoFill)"), "store registers the real trigger");
}

// --- 3. Store autoFill logic shape ---
{
  const af = read("src/store/autoFill.ts");
  assert(af.includes("/.netlify/functions/auto-fill-match-result"), "posts to the auto-fill function");
  assert(af.includes("autoFill:lockout:"), "uses sessionStorage lockout key");
  assert(af.includes("2 * 60 * 60 * 1000"), "uses 2h kickoff threshold");
  assert(af.includes("5 * 60 * 1000"), "uses 5-minute lockout (no escalation)");
  assert(af.includes("autoFillEnabled === false"), "honours the kill switch client-side");
  assert(/Bearer\s*\$\{idToken\}/.test(af), "sends a Firebase ID token");
  assert(!/homeScore|awayScore|advancingTeam/.test(af), "client never sends scores/advancing");
  // Regression: 202 is a 2xx, so res.ok would (wrongly) treat pending as
  // success and clear the lockout, re-firing every throttle tick. Success must
  // be keyed on the exact 200 status.
  assert(af.includes("res.status === 200"), "success keyed on status 200 (not res.ok)");
  assert(!/if\s*\(\s*res\.ok\s*\)/.test(af), "does not branch success on res.ok");

  const results = read("src/store/resultsRepo.ts");
  assert(/source:\s*"admin"/.test(results), "manual admin writes stamp source=admin");
  // Fully automatic: there must be NO admin approval flow.
  assert(!results.includes("approveAutoFill"), "no approveAutoFill (auto-fill is fully automatic)");
  assert(!results.includes("verifiedBy"), "no verifiedBy approval field");
}

// --- 4. Netlify function security + write shape ---
{
  const fn = read("netlify/functions/auto-fill-match-result.js");
  assert(fn.includes("verifyIdToken"), "function verifies the Firebase ID token");
  assert(fn.includes("autoFillEnabled === false"), "function honours the kill switch (503)");
  assert(fn.includes("503"), "function returns 503 when disabled");
  assert(fn.includes("425"), "function returns 425 when too early");
  assert(fn.includes("429"), "function rate-limits (429)");
  assert(fn.includes("RATE_LIMIT_MAX = 30"), "rate limit is 30/min");
  assert(fn.includes("autoFillLocks"), "function uses the per-match lock collection");
  assert(fn.includes("autoFillLog"), "function writes the audit log");
  assert(fn.includes('source: "auto"'), "write shape uses source=auto");
  assert(!fn.includes("verifiedBy"), "no verifiedBy approval field in write shape");
  assert(fn.includes('sourcesUsed: ["football-data"]'), "records sourcesUsed (single source)");
  assert(/source === "admin"/.test(fn), "never overwrites an admin-owned result");
  // Single-source mode: football-data only.
  assert(fn.includes("decideSingleSource"), "function uses single-source decision");
  assert(!fn.includes("fetchApiSports"), "function does not call api-sports");
  // PII: never write a raw (possibly phone_05XXXXXXXX) uid into the
  // auth-readable matchResults doc.
  assert(fn.includes('uid.startsWith("phone_") ? "phone_user" : uid'), "redacts phone uid in matchResults");
  assert(!/autoFilledBy:\s*uid,/.test(fn), "does not write the raw uid as autoFilledBy");
}

// --- 4b. Source clients orient to our schedule + use the 90' score ---
{
  const fd = read("netlify/functions/_sources/footballData.js");
  assert(fd.includes("score.fullTime") || fd.includes("fullTime"), "FD uses fullTime (90') score");
  assert(/\[home90, away90\] = \[away90, home90\]/.test(fd), "FD normalizes orientation (swaps score)");
  // Live-data fix: football-data uses CUW/URY where we use CUR/URU.
  assert(fd.includes("FD_TO_OURS"), "FD maps differing codes (CUW->CUR, URY->URU) to ours");

  const asrc = read("netlify/functions/_sources/apiSports.js");
  assert(asrc.includes("score?.fulltime") || asrc.includes("fulltime"), "AS uses fulltime (90') score");
  assert(/goals\.\*/.test(asrc) || asrc.includes("NOT goals"), "AS documents NOT using goals/aggregate");
  assert(/\[home90, away90\] = \[away90, home90\]/.test(asrc), "AS normalizes orientation when codes present");
  // Simultaneous-kickoff safety: identify the fixture by TEAMS, not time.
  assert(asrc.includes("matchTeamName"), "AS resolves team names to codes (teamCodes)");
  assert(asrc.includes("findFixture"), "AS selects fixture by team identity");
  assert(!asrc.includes("pickClosest"), "AS no longer selects by kickoff proximity (simultaneous-kickoff bug)");

  const codes = read("netlify/functions/_sources/teamCodes.js");
  assert(codes.includes("matchTeamName"), "teamCodes exports matchTeamName");
  // All 48 tournament codes must be present in the alias table.
  for (const c of ["MEX","RSA","KOR","CZE","CAN","BIH","QAT","SUI","BRA","MAR","HAI","SCO","USA","PAR","AUS","TUR","GER","CUR","CIV","ECU","NED","JPN","SWE","TUN","BEL","EGY","IRN","NZL","ESP","CPV","KSA","URU","FRA","SEN","IRQ","NOR","ARG","ALG","AUT","JOR","POR","COD","UZB","COL","ENG","CRO","GHA","PAN"]) {
    assert(codes.includes(`${c}:`), `teamCodes has alias entry for ${c}`);
  }
}

// --- 5. Firestore rules ---
{
  const rules = read("firestore.rules");
  assert(/match \/autoFillLocks\/\{matchId\}/.test(rules), "rules add autoFillLocks");
  assert(/match \/autoFillLog\/\{logId\}/.test(rules), "rules add autoFillLog");
  // matchResults write rule must stay admin-only (not relaxed).
  assert(rules.includes("docId in ['matchResults', 'settings', 'actualBonuses', 'actualAdvancing', 'uidMigrationMap']"),
    "matchResults write rule unchanged (admin-only)");
}

// --- 6. Admin UI: fully automatic, NO approval flow ---
{
  const ui = read("src/components/AdminResultsTab.tsx");
  assert(!ui.includes("approveAutoFill"), "admin tab has no approve action");
  assert(!ui.includes("לאישור"), "admin tab has no approval badge");
}

console.log("");
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log("  - " + f));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
