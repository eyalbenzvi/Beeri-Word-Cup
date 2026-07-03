// Regression suite for "המצב שלי בתחרות" (competition analysis).
//
// Functional locks (engine-level, complementing the vitest unit tests):
//   1. Same-seed parity: the personal analyzer's P(rank=1) equals the
//      canonical scenario engine's overall.winProb — both sample the same
//      tournaments and score through scoreFormFast, so any drift in the
//      reimplemented ranking loop shows up here immediately.
//   2. Conditional slices partition the run (root-for math is well-formed).
//
// Static regression assertions (repo convention — CLAUDE.md discipline):
//   the five existing-file touch points stay additive and flag-gated, the
//   failure paths stay in place (worker onerror / try-catch / watchdog),
//   and the feature stays OUT of GUEST_PAGES.

import fs from "node:fs";
import { predictScenario } from "/home/user/Beeri-World-Cup/src/utils/scenarioPredictor.ts";
import { groupMatches, knockoutMatches } from "/home/user/Beeri-World-Cup/src/data/matches.ts";
import { calcBracketTeams } from "/home/user/Beeri-World-Cup/src/utils/bracket.ts";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.ts";
import { mulberry32, simulateTournament, runScenarioSimulation } from "/home/user/Beeri-World-Cup/src/utils/scenarioSim.ts";
import { computeCurrentElo } from "/home/user/Beeri-World-Cup/src/utils/eloModel.ts";
import { runPersonalAnalysis } from "/home/user/Beeri-World-Cup/src/utils/personalAnalysis.ts";
import { computePoolCertainty, isClinchedTopN } from "/home/user/Beeri-World-Cup/src/utils/poolCertainty.ts";
import { canUseCompetitionAnalysis } from "/home/user/Beeri-World-Cup/src/utils/featureFlags.ts";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }
const read = (p) => fs.readFileSync("/home/user/Beeri-World-Cup/" + p, "utf8");

console.log("=== COMPETITION ANALYSIS ===\n");

// ── World builders ─────────────────────────────────────────────────
const allCodes = Object.values(GROUPS).flat().map((t) => t.code);
function genForms(n, seed) {
  const rnd = mulberry32(seed);
  const pick = () => allCodes[Math.floor(rnd() * allCodes.length)];
  const forms = {};
  for (let i = 0; i < n; i++) {
    let c = pick(), r = pick();
    while (r === c) r = pick();
    forms[`f${i}`] = {
      formId: `f${i}`, userId: `u${i}`, formName: `F${i}`, status: "submitted",
      matches: predictScenario(c, r, groupMatches, knockoutMatches, calcBracketTeams, {}),
    };
  }
  return forms;
}
const fullWorld = simulateTournament(mulberry32(33), {}, computeCurrentElo({}));
const groupsPlayed = {};
for (const m of groupMatches) groupsPlayed[m.id] = fullWorld[m.id];

// ── 1. Same-seed parity lock ───────────────────────────────────────
console.log("1. Same-seed parity with the canonical engine");
{
  const forms = genForms(7, 99);
  const SIMS = 400, SEED = 7;
  const mine = runPersonalAnalysis({
    allPredictions: forms, results: groupsPlayed, actualBonuses: {},
    targetFormIds: Object.keys(forms), watchMatches: [], simCount: SIMS, seed: SEED,
  });
  const engine = runScenarioSimulation({
    allPredictions: forms, results: groupsPlayed, actualBonuses: {}, simCount: SIMS, seed: SEED,
  });
  assert(mine.simCount === SIMS, "personal run completed all sims");
  assert(engine.overall && engine.formOrder.length === 7, "engine produced overall aggregate");
  let maxDiff = 0;
  for (const tf of mine.targetForms) {
    const i = engine.formOrder.indexOf(tf.formId);
    const diff = Math.abs(tf.hist[0] / SIMS - engine.overall.winProb[i]);
    if (diff > maxDiff) maxDiff = diff;
  }
  // engine rounds to 4dp — anything beyond that is real drift.
  assert(maxDiff <= 0.00005, `winProb parity within engine rounding (maxDiff=${maxDiff})`);
}

// ── 2. Conditional slices are a partition ──────────────────────────
console.log("2. Root-for conditional slices");
{
  const forms = genForms(6, 5);
  const watch = knockoutMatches.filter((m) => m.stage === "R32").slice(0, 3)
    .map((m) => ({ id: m.id, isKnockout: true }));
  const SIMS = 300;
  const agg = runPersonalAnalysis({
    allPredictions: forms, results: groupsPlayed, actualBonuses: {},
    targetFormIds: ["f0"], watchMatches: watch, simCount: SIMS, seed: 11,
  });
  for (const wm of agg.watch) {
    const total = wm.outcomes.reduce((a, o) => a + o.n, 0);
    assert(total === SIMS, `${wm.matchId}: outcome slices partition the run (${total}/${SIMS})`);
    assert(wm.outcomes.every((o) => o.key !== "draw"), `${wm.matchId}: KO has no draw outcome`);
    assert(wm.shake >= 0, `${wm.matchId}: shake is non-negative`);
  }
}

// ── 2b. Head-to-head (rival) counters ──────────────────────────────
console.log("2b. Head-to-head beat counters");
{
  const forms = genForms(6, 5);
  const watch = knockoutMatches.filter((m) => m.stage === "R32").slice(0, 2)
    .map((m) => ({ id: m.id, isKnockout: true }));
  const SIMS = 300;
  const base = { allPredictions: forms, results: groupsPlayed, actualBonuses: {}, watchMatches: watch, simCount: SIMS, seed: 11 };
  const agg = runPersonalAnalysis({ ...base, targetFormIds: ["f0", "f2"], rivalFormId: "f2" });
  assert(agg.rivalFormId === "f2", "aggregate echoes the rival form id");
  const f0 = agg.targetForms.find((t) => t.formId === "f0");
  const self = agg.targetForms.find((t) => t.formId === "f2");
  assert(self.hits.beat === 0, "a form never beats itself");
  assert(f0.hits.beat >= 0 && f0.hits.beat <= SIMS, "beat bounded by the run");
  const idx = agg.targetForms.indexOf(f0);
  for (const wm of agg.watch) {
    const sliced = wm.outcomes.reduce((a, o) => a + (o.hits[idx].beat || 0), 0);
    assert(sliced === f0.hits.beat, `${wm.matchId}: outcome beat slices partition the overall count`);
  }
  // Anti-symmetry (up to exact rank ties): P(A>B) + P(B>A) ≤ 1 on shared sims.
  const mirror = runPersonalAnalysis({ ...base, targetFormIds: ["f0", "f2"], rivalFormId: "f0" });
  const f2BeatsF0 = mirror.targetForms.find((t) => t.formId === "f2").hits.beat;
  assert(f0.hits.beat + f2BeatsF0 <= SIMS, "beat counters are anti-symmetric up to ties");
  // No rival → beat stays 0 and the echo is null.
  const plain = runPersonalAnalysis({ ...base, targetFormIds: ["f0"] });
  assert(plain.rivalFormId === null, "no rival → null echo");
  assert(plain.targetForms[0].hits.beat === 0, "no rival → beat is 0");
}

// ── 3. Certainty layer sanity on a decided world ───────────────────
console.log("3. Deterministic certainty");
{
  const forms = genForms(5, 3);
  const cert = computePoolCertainty(fullWorld, forms, { topScorers: ["X"] });
  // Fully decided (incl. top scorer): leader is clinched 1st, everyone's
  // bound is 0, and non-leaders are not alive for first.
  const leader = cert.forms[0];
  assert(leader.maxRemaining === 0, "fully-decided world → zero remaining bound");
  assert(isClinchedTopN(cert, leader.formId, 1) === (cert.forms.filter(f => f.totalPoints === leader.totalPoints).length === 1),
    "leader clinched iff unique top score");
  for (const f of cert.forms) {
    if (f.totalPoints < leader.totalPoints) {
      assert(!f.aliveForFirst, `${f.formId} with fewer points is not alive on a decided world`);
    }
  }
}

// ── 4. Flag gate is fail-closed (functional spot-check) ────────────
console.log("4. Feature flag");
{
  assert(canUseCompetitionAnalysis(undefined, { id: "u" }) === false, "missing settings → closed");
  assert(canUseCompetitionAnalysis({ features: { competitionAnalysis: { mode: "all" } } }, { id: "u" }) === true, "all → open");
  assert(canUseCompetitionAnalysis({ features: { competitionAnalysis: { mode: "allowlist", allow: ["u"] } } }, { id: "u" }) === true, "allowlist member → open");
  assert(canUseCompetitionAnalysis({ features: { competitionAnalysis: { mode: "allowlist", allow: [] } } }, { id: "u" }) === false, "allowlist non-member → closed");
}

// ── 5. Static wiring assertions ────────────────────────────────────
console.log("5. Static wiring (additive, flag-gated touch points)");
{
  const app = read("src/App.tsx");
  assert(app.includes('mystatus: CompetitionStatus'), "App.tsx registers the mystatus page");
  assert(app.includes('lazyWithRetry(() => import("./pages/CompetitionStatus"))'), "page is lazy-loaded with retry");
  const guestSet = (app.match(/const GUEST_PAGES = new Set\(\[[\s\S]*?\]\)/) || [""])[0];
  assert(guestSet.length > 0 && !guestSet.includes("mystatus"),
    "mystatus is NOT a guest page (deep links normalize home)");

  const nav = read("src/hooks/useNavigation.tsx");
  assert(nav.includes('"mystatus"'), "useNavigation URL_PAGES includes mystatus");

  const lb = read("src/pages/Leaderboard.tsx");
  assert((lb.match(/CompetitionAnalysisEntry/g) || []).length >= 3, "Leaderboard mounts the entry (import + 2 mounts)");

  const admin = read("src/components/AdminSettingsTab.tsx");
  assert(admin.includes("CompetitionAnalysisAdminControl"), "AdminSettingsTab mounts the release control");

  const entry = read("src/components/competitionStatus/CompetitionAnalysisEntry.tsx");
  assert(entry.includes("useCompetitionAnalysisAccess"), "entry gates through the access hook");
  const access = read("src/hooks/useCompetitionAnalysisAccess.ts");
  assert(access.includes("useSettingsServerConfirmed"), "access hook requires SERVER-confirmed settings (no flash)");

  const hook = read("src/hooks/usePersonalAnalysis.ts");
  assert(hook.includes("worker.onerror"), "worker onerror handled");
  assert(hook.includes("WATCHDOG_MS"), "watchdog present (no eternal spinner)");
  assert(/try\s*\{[\s\S]*new Worker/.test(hook), "worker construction wrapped in try/catch");

  const worker = read("src/workers/personalAnalysisWorker.ts");
  assert(worker.includes('type: "error"'), "worker reports errors as messages");

  const analysis = read("src/utils/personalAnalysis.ts");
  assert(analysis.includes("simulateTournament") && analysis.includes("scoreFormFast"),
    "analyzer reuses the canonical engine (no scoring reimplementation)");

  const certainty = read("src/utils/poolCertainty.ts");
  assert(certainty.includes("BONUSES.topScorer"), "certainty bound includes the top-scorer term");
  assert(certainty.includes("computeCore"), "certainty scores via the canonical leaderboard core");

  // Any-form analysis + head-to-head wiring.
  const page = read("src/pages/CompetitionStatus.tsx");
  assert(page.includes("submittedForms"), "page selects over the whole submitted pool (any-form analysis)");
  assert(page.includes("HeadToHeadSection"), "page mounts the head-to-head section");
  assert(page.includes("owned={owned}"), "page passes ownership to the copy-aware sections");
  assert(hook.includes("rivalFormId"), "hook threads the rival into the run");
  assert(/targetKey = `\$\{targetFormIds\.join\(","\)\}~\$\{rivalFormId/.test(hook),
    "rival is part of the run cache key (switching rivals restarts the run)");
  assert(worker.includes("rivalFormId"), "worker forwards the rival to the engine");
  const h2h = read("src/components/competitionStatus/HeadToHeadSection.tsx");
  assert(h2h.includes("agg.rivalFormId !== rival.formId") || h2h.includes("agg.rivalFormId === rival.formId"),
    "head-to-head rejects a stale aggregate (rival echo check)");
  assert(h2h.includes("maxRemaining"), "head-to-head deterministic claims use the sound certainty bounds");
  const verdictSrc = read("src/components/competitionStatus/VerdictSection.tsx");
  assert(verdictSrc.includes("verdictSentenceThirdPerson"), "verdict has a third-person branch for foreign forms");
}

// ── 6. Copy contract: alive-badge gating + gender-neutral Hebrew ────
console.log("6. Copy contract");
{
  // The "still in the race" badge must be gated on the win being the
  // verdict's OWN target — the sound bound is loose by design, so showing it
  // to every not-yet-eliminated form reads as a false promise (user report).
  const verdict = read("src/components/competitionStatus/VerdictSection.tsx");
  assert(
    /aliveForFirst && analysis\?\.target\.key === "win"/.test(verdict),
    "alive badge gated on target.key === 'win'",
  );

  // Gender-neutral copy guard: no masculine-singular address in any
  // user-facing component of the feature (per the Hebrew review). Tokens
  // chosen to avoid false positives (e.g. plural תעודדו does not match).
  const uiFiles = [
    "src/components/competitionStatus/VerdictSection.tsx",
    "src/components/competitionStatus/RootForSection.tsx",
    "src/components/competitionStatus/OutlookSection.tsx",
    "src/components/competitionStatus/CompetitionAnalysisEntry.tsx",
    "src/components/competitionStatus/HeadToHeadSection.tsx",
    "src/pages/CompetitionStatus.tsx",
  ];
  const masculine = ["אתה ", "בוא נ", "תיהנה", "אל תיתן", "תעודד את", "שתסיים", "שתשמור", "שתנחת"];
  // Phrases the owner explicitly rejected — must never come back.
  const banned = ["למי לעודד", "בטווח שלך", "לטלטל את הטבלה", "מזיזה את"];
  for (const f of uiFiles) {
    const src = read(f);
    for (const tok of masculine) {
      assert(!src.includes(tok), `${f}: no masculine-singular token "${tok}"`);
    }
    for (const tok of banned) {
      assert(!src.includes(tok), `${f}: no banned phrase "${tok}"`);
    }
  }
}

console.log(`\n=== COMPETITION ANALYSIS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.error("\nFailures:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
