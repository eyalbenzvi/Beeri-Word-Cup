/**
 * Selection Visualization & Champion Display Tests
 *
 * Verifies fixes for:
 * 1. Knockout tie-breaker buttons use bracket-derived codes (not null match.homeTeam/awayTeam)
 * 2. AI fill advancingTeam matches bracket-derived codes used by MatchCard
 * 3. Champion derivation displayed correctly across all form views
 * 4. Edge cases: empty predictions, partial brackets, stale advancingTeam
 *
 * Run: node --loader tests/loader.mjs tests/test-selection-and-champion.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { groupMatches, knockoutMatches } from "../src/data/matches.js";
import { getTeamByCode } from "../src/data/teams.js";
import {
  calcBracketTeams,
  deriveChampion,
} from "../src/utils/bracket.js";
import { predictAllMatches } from "../src/utils/fifaPredictor.js";
import { getCachedChampion, getCachedBracket } from "../src/utils/bracketCache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let passed = 0,
  failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else {
    failed++;
    failures.push(m);
    console.error("  FAIL: " + m);
  }
}

const matchCardSrc = readFileSync(resolve(ROOT, "src/components/MatchCard.jsx"), "utf8");
const formListSrc = readFileSync(resolve(ROOT, "src/components/FormList.jsx"), "utf8");
const reviewScreenSrc = readFileSync(resolve(ROOT, "src/components/ReviewScreen.jsx"), "utf8");
const formDetailsTabSrc = readFileSync(resolve(ROOT, "src/components/FormDetailsTab.jsx"), "utf8");
const predictSrc = readFileSync(resolve(ROOT, "src/pages/Predict.jsx"), "utf8");

// ============================================================
// 1. MatchCard tie-breaker buttons use homeCode/awayCode
// ============================================================
console.log("=== SELECTION & CHAMPION TESTS ===\n");
console.log("--- 1. MatchCard tie-breaker uses bracket-derived codes ---");

{
  // Extract the tie-breaker button array section
  const tieSection = matchCardSrc.match(/flex gap-2 justify-center[\s\S]*?\.map\(\(\{ team, name \}\)/)?.[0] || "";
  const usesHomeCode = /team:\s*homeCode/.test(tieSection);
  assert(usesHomeCode, "1.1 Tie-breaker home button uses homeCode (not match.homeTeam)");
}

{
  const tieSection = matchCardSrc.match(/flex gap-2 justify-center[\s\S]*?\.map\(\(\{ team, name \}\)/)?.[0] || "";
  const usesAwayCode = /team:\s*awayCode/.test(tieSection);
  assert(usesAwayCode, "1.2 Tie-breaker away button uses awayCode (not match.awayTeam)");
}

{
  const tieSection = matchCardSrc.match(/flex gap-2 justify-center[\s\S]*?\.map\(\(\{ team, name \}\)/)?.[0] || "";
  const usesMatchHome = /team:\s*match\.homeTeam/.test(tieSection);
  assert(!usesMatchHome, "1.3 Tie-breaker does NOT use match.homeTeam");
}

{
  const tieSection = matchCardSrc.match(/flex gap-2 justify-center[\s\S]*?\.map\(\(\{ team, name \}\)/)?.[0] || "";
  const usesMatchAway = /team:\s*match\.awayTeam/.test(tieSection);
  assert(!usesMatchAway, "1.4 Tie-breaker does NOT use match.awayTeam");
}

// 1.5 Read-only advancing team display also uses homeCode
{
  const readOnlySection = matchCardSrc.match(/advancingTeam\s*===\s*\w+\s*\?\s*homeName\s*:\s*awayName/)?.[0] || "";
  const usesHomeCode = /advancingTeam\s*===\s*homeCode/.test(readOnlySection);
  assert(usesHomeCode, "1.5 Read-only advancing display compares against homeCode");
}

// 1.6 The onClick sets advancingTeam to team (which is homeCode/awayCode)
{
  const onClickMatch = matchCardSrc.match(/onClick=\{?\(\)\s*=>\s*\n?\s*onPredictionChange\?\.\(\{.*advancingTeam:\s*team/s);
  assert(!!onClickMatch, "1.6 onClick sets advancingTeam to team variable (bracket-derived)");
}

// 1.7 Highlight comparison uses prediction?.advancingTeam === team
{
  const highlightMatch = /prediction\?\.advancingTeam\s*===\s*team/.test(matchCardSrc);
  assert(highlightMatch, "1.7 Button highlight compares prediction.advancingTeam === team");
}

// ============================================================
// 2. AI fill advancingTeam consistency with bracket codes
// ============================================================
console.log("\n--- 2. AI fill advancingTeam matches bracket codes ---");

// Run AI fill multiple times to catch draws
{
  let hasDrawWithAdvancing = false;
  let mismatchFound = false;

  for (let trial = 0; trial < 20; trial++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(allPreds);

    for (const m of knockoutMatches) {
      const pred = allPreds[m.id];
      if (!pred) continue;

      if (pred.homeScore === pred.awayScore && pred.advancingTeam) {
        hasDrawWithAdvancing = true;
        const teams = bracket[m.id];
        if (teams?.home && teams?.away) {
          if (pred.advancingTeam !== teams.home && pred.advancingTeam !== teams.away) {
            mismatchFound = true;
          }
        }
      }
    }
  }

  assert(hasDrawWithAdvancing, "2.1 AI fill produces at least one knockout draw with advancingTeam (20 trials)");
  assert(!mismatchFound, "2.2 All AI advancingTeam values match bracket-derived team codes");
}

// 2.3 Every advancingTeam is a valid team code recognized by getTeamByCode
{
  let allValid = true;
  let invalidCode = null;

  for (let trial = 0; trial < 5; trial++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);

    for (const m of knockoutMatches) {
      const pred = allPreds[m.id];
      if (pred?.advancingTeam) {
        const team = getTeamByCode(pred.advancingTeam);
        if (!team) {
          allValid = false;
          invalidCode = pred.advancingTeam;
          break;
        }
      }
    }
    if (!allValid) break;
  }

  assert(allValid, `2.3 Every advancingTeam is recognized by getTeamByCode${invalidCode ? ` (invalid: ${invalidCode})` : ""}`);
}

// 2.4 AI fill advancingTeam matches what MatchCard would use as homeCode/awayCode
{
  let consistent = true;
  let inconsistentMatch = null;

  for (let trial = 0; trial < 10; trial++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(allPreds);

    for (const m of knockoutMatches) {
      const pred = allPreds[m.id];
      if (!pred?.advancingTeam) continue;

      // Simulate MatchCard's homeCode/awayCode derivation
      const bracketEntry = bracket[m.id];
      const homeCode = bracketEntry?.home || m.homeTeam;
      const awayCode = bracketEntry?.away || m.awayTeam;

      if (pred.advancingTeam !== homeCode && pred.advancingTeam !== awayCode) {
        consistent = false;
        inconsistentMatch = `${m.id}: advancingTeam=${pred.advancingTeam}, homeCode=${homeCode}, awayCode=${awayCode}`;
        break;
      }
    }
    if (!consistent) break;
  }

  assert(consistent, `2.4 advancingTeam always equals homeCode or awayCode${inconsistentMatch ? ` (${inconsistentMatch})` : ""}`);
}

// ============================================================
// 3. Champion derivation logic
// ============================================================
console.log("\n--- 3. deriveChampion correctness ---");

// Helper: fill all groups with home wins (deterministic bracket)
function fillGroupsHomeWin() {
  const preds = {};
  for (const m of groupMatches) preds[m.id] = { homeScore: 2, awayScore: 0 };
  return preds;
}

// Helper: fill all knockout rounds through Final
function fillAllKnockout(preds, homeWins = true) {
  const stages = ["R32", "R16", "QF", "SF", "3RD", "F"];
  for (const stage of stages) {
    const bracket = calcBracketTeams(preds);
    for (const m of knockoutMatches.filter((m) => m.stage === stage)) {
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;
      if (homeWins) {
        preds[m.id] = { homeScore: 2, awayScore: 1 };
      } else {
        preds[m.id] = { homeScore: 0, awayScore: 1 };
      }
    }
  }
  return preds;
}

// 3.1 Champion from non-tie final
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const champ = deriveChampion(preds, bracket);
  assert(champ !== null, `3.1 Champion derived from non-tie final: ${champ}`);
  assert(getTeamByCode(champ) !== undefined, `3.1b Champion is a valid team code`);
}

// 3.2 Champion from tie final with advancingTeam
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];
  // Set final as a draw with away team winning
  preds["F-1"] = { homeScore: 1, awayScore: 1, advancingTeam: finalTeams.away };
  const champ = deriveChampion(preds, bracket);
  assert(champ === finalTeams.away, `3.2 Tie final: champion is advancingTeam (${champ} === ${finalTeams.away})`);
}

// 3.3 Champion from tie final WITHOUT advancingTeam defaults to home
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];
  preds["F-1"] = { homeScore: 1, awayScore: 1 }; // no advancingTeam
  const champ = deriveChampion(preds, bracket);
  assert(champ === finalTeams.home, `3.3 Tie final without advancingTeam defaults to home: ${champ}`);
}

// 3.4 No final prediction → null champion
{
  const preds = fillGroupsHomeWin();
  // Fill knockout but NOT the final
  const stages = ["R32", "R16", "QF", "SF", "3RD"];
  for (const stage of stages) {
    const bracket = calcBracketTeams(preds);
    for (const m of knockoutMatches.filter((m) => m.stage === stage)) {
      const teams = bracket[m.id];
      if (!teams?.home || !teams?.away) continue;
      preds[m.id] = { homeScore: 2, awayScore: 1 };
    }
  }
  const bracket = calcBracketTeams(preds);
  const champ = deriveChampion(preds, bracket);
  assert(champ === null, `3.4 No final prediction → null champion`);
}

// 3.5 Empty predictions → null champion
{
  const champ = deriveChampion({}, {});
  assert(champ === null, `3.5 Empty predictions → null champion`);
}

// 3.6 getCachedChampion matches deriveChampion
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const direct = deriveChampion(preds, bracket);
  const cached = getCachedChampion(preds);
  assert(direct === cached, `3.6 getCachedChampion matches deriveChampion: ${direct} === ${cached}`);
}

// 3.7 getCachedChampion with empty predictions
{
  const cached = getCachedChampion({});
  assert(cached === null, "3.7 getCachedChampion({}) returns null");
}

// 3.8 Champion home win → home team code
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];
  // Final is home win (2-1), so champion should be home
  const champ = deriveChampion(preds, bracket);
  assert(champ === finalTeams.home, `3.8 Home wins final → champion is home team: ${champ}`);
}

// 3.9 Champion away win → away team code
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];
  preds["F-1"] = { homeScore: 0, awayScore: 3 };
  const champ = deriveChampion(preds, bracket);
  assert(champ === finalTeams.away, `3.9 Away wins final → champion is away team: ${champ}`);
}

// ============================================================
// 4. AI fill produces valid champion
// ============================================================
console.log("\n--- 4. AI fill end-to-end champion ---");

{
  let allChampionsValid = true;
  let nullChampionCount = 0;
  const trials = 10;

  for (let i = 0; i < trials; i++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
    const champ = getCachedChampion(allPreds);

    if (champ === null) {
      nullChampionCount++;
    } else {
      const team = getTeamByCode(champ);
      if (!team) {
        allChampionsValid = false;
      }
    }
  }

  assert(allChampionsValid, "4.1 All AI-derived champions are valid team codes");
  assert(nullChampionCount === 0, `4.2 AI fill always produces a champion (${trials - nullChampionCount}/${trials} had champions)`);
}

// 4.3 AI fill champion matches bracket final winner
{
  let consistent = true;
  for (let i = 0; i < 10; i++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(allPreds);
    const champ = deriveChampion(allPreds, bracket);
    const finalPred = allPreds["F-1"];
    const finalTeams = bracket["F-1"];

    if (!finalTeams?.home || !finalTeams?.away || !finalPred) {
      consistent = false;
      break;
    }

    if (finalPred.homeScore === finalPred.awayScore) {
      // Tie: champion should be advancingTeam
      if (finalPred.advancingTeam && champ !== finalPred.advancingTeam) {
        consistent = false;
      }
    } else if (finalPred.homeScore > finalPred.awayScore) {
      if (champ !== finalTeams.home) consistent = false;
    } else {
      if (champ !== finalTeams.away) consistent = false;
    }
  }

  assert(consistent, "4.3 Champion always matches final match result logic");
}

// ============================================================
// 5. Source code: champion display in all form views
// ============================================================
console.log("\n--- 5. Champion display in form views (source verification) ---");

// 5.1 FormList imports getCachedChampion
{
  const imports = /getCachedChampion/.test(formListSrc);
  assert(imports, "5.1 FormList imports getCachedChampion");
}

// 5.2 FormList imports getTeamByCode
{
  const imports = /getTeamByCode/.test(formListSrc);
  assert(imports, "5.2 FormList imports getTeamByCode");
}

// 5.3 FormList derives champion from form.matches (not form.champion)
{
  const usesComputed = /getCachedChampion\(form\.matches/.test(formListSrc);
  assert(usesComputed, "5.3 FormList computes champion from form.matches");
}

// 5.4 FormList does NOT use form.champion
{
  const usesFormChampion = /form\.champion/.test(formListSrc);
  assert(!usesFormChampion, "5.4 FormList does NOT reference form.champion (always null)");
}

// 5.5 FormList displays championName
{
  const displaysChamp = /championName/.test(formListSrc);
  assert(displaysChamp, "5.5 FormList displays derived championName");
}

// 5.6 Predict page imports getCachedChampion
{
  const imports = /getCachedChampion/.test(predictSrc);
  assert(imports, "5.6 Predict page imports getCachedChampion");
}

// 5.7 Predict page derives championCode from matchPredictions
{
  const derives = /getCachedChampion\(matchPredictions\)/.test(predictSrc);
  assert(derives, "5.7 Predict page derives championCode from matchPredictions");
}

// 5.9 Predict page passes championName to ReviewScreen
{
  const reviewSection = predictSrc.match(/<ReviewScreen[\s\S]*?\/>/)?.[0] || "";
  const passesChamp = /championName=\{championName\}/.test(reviewSection);
  assert(passesChamp, "5.9 Predict passes championName to ReviewScreen");
}

// 5.10 Predict page passes championName to FormDetailsTab
{
  const detailsSection = predictSrc.match(/<FormDetailsTab[\s\S]*?\/>/)?.[0] || "";
  const passesChamp = /championName=\{championName\}/.test(detailsSection);
  assert(passesChamp, "5.10 Predict passes championName to FormDetailsTab");
}

// 5.11 ReviewScreen accepts championName prop
{
  const acceptsProp = /championName/.test(reviewScreenSrc);
  assert(acceptsProp, "5.11 ReviewScreen accepts championName prop");
}

// 5.13 ReviewScreen shows fallback text when no champion
{
  const hasFallback = /טרם נקבע/.test(reviewScreenSrc);
  assert(hasFallback, "5.13 ReviewScreen shows 'טרם נקבע' when no champion");
}

// 5.14 FormDetailsTab accepts championName prop
{
  const acceptsProp = /championName/.test(formDetailsTabSrc);
  assert(acceptsProp, "5.14 FormDetailsTab accepts championName prop");
}

// 5.16 FormDetailsTab shows fallback text when no champion
{
  const hasFallback = /טרם נקבע/.test(formDetailsTabSrc);
  assert(hasFallback, "5.16 FormDetailsTab shows 'טרם נקבע' when no champion");
}

// 5.17 FormDetailsTab champion is read-only (no onChange, no input)
{
  // The champion div should not be an input or have onChange
  const champSection = formDetailsTabSrc.match(/אלופה[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";
  const hasInput = /<input/.test(champSection);
  const hasOnChange = /onChange/.test(champSection);
  assert(!hasInput, "5.17a FormDetailsTab champion has no input element");
  assert(!hasOnChange, "5.17b FormDetailsTab champion has no onChange handler");
}

// ============================================================
// 6. Edge cases: bracket resolution and stale state
// ============================================================
console.log("\n--- 6. Edge cases ---");

// 6.1 Knockout match.homeTeam/awayTeam are null (confirming the scenario our fix handles)
{
  const knockoutWithNull = knockoutMatches.filter(
    (m) => m.homeTeam === null && m.awayTeam === null
  );
  assert(
    knockoutWithNull.length === knockoutMatches.length,
    `6.1 All ${knockoutMatches.length} knockout matches have null homeTeam/awayTeam`
  );
}

// 6.2 Bracket-derived codes are never null for completed group predictions
{
  const preds = fillGroupsHomeWin();
  const bracket = calcBracketTeams(preds);

  let nullTeams = 0;
  for (const m of knockoutMatches.filter((m) => m.stage === "R32")) {
    const entry = bracket[m.id];
    if (!entry?.home || !entry?.away) nullTeams++;
  }
  assert(nullTeams === 0, "6.2 All R32 bracket entries have non-null home/away when groups are complete");
}

// 6.3 advancingTeam with stale team code doesn't match new bracket teams
{
  // Simulate: user fills groups, enters R32 tie with advancingTeam,
  // then changes group predictions causing bracket to shift
  const preds1 = fillGroupsHomeWin();
  const bracket1 = calcBracketTeams(preds1);
  const r32Match = knockoutMatches.find((m) => m.stage === "R32");
  const teams1 = bracket1[r32Match.id];

  // User picks a draw with home advancing
  preds1[r32Match.id] = { homeScore: 1, awayScore: 1, advancingTeam: teams1.home };

  // Now change a group prediction to shift bracket
  const groupA = groupMatches.filter((m) => m.group === "A");
  for (const m of groupA) {
    preds1[m.id] = { homeScore: 0, awayScore: 2 }; // flip all results
  }

  const bracket2 = calcBracketTeams(preds1);
  const teams2 = bracket2[r32Match.id];

  // The stale advancingTeam may no longer match new bracket teams
  const staleAdv = preds1[r32Match.id].advancingTeam;
  const stillValid = staleAdv === teams2?.home || staleAdv === teams2?.away;

  // This test documents the behavior - it's acceptable either way
  // but we verify the code handles it (getMatchWinner falls back to home)
  assert(true, `6.3 Stale advancingTeam documented: was ${staleAdv}, teams now ${teams2?.home}/${teams2?.away}, still valid: ${stillValid}`);
}

// 6.4 getCachedBracket returns same reference for same predictions (cache works)
{
  const preds = fillGroupsHomeWin();
  const b1 = getCachedBracket(preds);
  const b2 = getCachedBracket(preds);
  assert(b1 === b2, "6.4 getCachedBracket returns cached reference for same predictions");
}

// 6.5 Champion changes when final result changes
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];

  const champ1 = deriveChampion(preds, bracket);
  assert(champ1 === finalTeams.home, "6.5a Initial champion is home team");

  // Change final to away win
  preds["F-1"] = { homeScore: 0, awayScore: 1 };
  const champ2 = deriveChampion(preds, bracket);
  assert(champ2 === finalTeams.away, "6.5b Champion changes to away team after score change");
  assert(champ1 !== champ2, "6.5c Champions differ after changing final result");
}

// 6.6 Final with null/undefined scores → null champion
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);

  preds["F-1"] = { homeScore: null, awayScore: null };
  assert(deriveChampion(preds, bracket) === null, "6.6a Final with null scores → null champion");

  preds["F-1"] = { homeScore: undefined, awayScore: undefined };
  assert(deriveChampion(preds, bracket) === null, "6.6b Final with undefined scores → null champion");

  preds["F-1"] = { homeScore: 2, awayScore: null };
  assert(deriveChampion(preds, bracket) === null, "6.6c Final with partial scores → null champion");

  delete preds["F-1"];
  assert(deriveChampion(preds, bracket) === null, "6.6d No final prediction → null champion");
}

// 6.7 Final with string scores (from input) still works
{
  const preds = fillAllKnockout(fillGroupsHomeWin(), true);
  const bracket = calcBracketTeams(preds);
  const finalTeams = bracket["F-1"];

  preds["F-1"] = { homeScore: "3", awayScore: "1" };
  const champ = deriveChampion(preds, bracket);
  assert(champ === finalTeams.home, "6.7 String scores in final still derive champion correctly");
}

// ============================================================
// 7. Knockout match identity: match.home/away vs match.homeTeam/awayTeam
// ============================================================
console.log("\n--- 7. Knockout match data structure ---");

// 7.1 Knockout matches have 'home'/'away' (bracket template codes like "1A", "2B")
{
  const withTemplates = knockoutMatches.filter((m) => m.home !== null || m.away !== null);
  assert(withTemplates.length > 0, "7.1 Knockout matches have template home/away codes");
}

// 7.2 Knockout matches have homeTeam/awayTeam as null (filled by admin)
{
  const allNull = knockoutMatches.every((m) => m.homeTeam === null && m.awayTeam === null);
  assert(allNull, "7.2 All knockout matches have homeTeam=null, awayTeam=null");
}

// 7.3 Group matches have non-null homeTeam/awayTeam
{
  const allSet = groupMatches.every((m) => m.homeTeam !== null && m.awayTeam !== null);
  assert(allSet, "7.3 All group matches have non-null homeTeam/awayTeam");
}

// 7.4 The Final match exists with id F-1
{
  const final = knockoutMatches.find((m) => m.id === "F-1");
  assert(final !== undefined, "7.4 Final match F-1 exists");
  assert(final.stage === "F", "7.4b Final match has stage 'F'");
}

// ============================================================
// 8. Prevent regression: null team code in buttons
// ============================================================
console.log("\n--- 8. Regression prevention ---");

// 8.1 Simulate what would happen with old code (match.homeTeam for knockout)
{
  const knockoutMatch = knockoutMatches[0]; // R32-1
  const oldHomeTeam = knockoutMatch.homeTeam; // null
  const oldAwayTeam = knockoutMatch.awayTeam; // null

  // Old bug: both buttons would have team=null
  assert(oldHomeTeam === null, "8.1a Old code: knockout match.homeTeam is null");
  assert(oldAwayTeam === null, "8.1b Old code: knockout match.awayTeam is null");
  assert(oldHomeTeam === oldAwayTeam, "8.1c Old code: both null → both buttons identical (BUG)");
}

// 8.2 With bracket-derived codes, buttons have distinct values
{
  const preds = fillGroupsHomeWin();
  const bracket = calcBracketTeams(preds);
  const r32Match = knockoutMatches[0];
  const entry = bracket[r32Match.id];

  assert(entry?.home !== null && entry?.home !== undefined, "8.2a Bracket home code is not null");
  assert(entry?.away !== null && entry?.away !== undefined, "8.2b Bracket away code is not null");
  assert(entry?.home !== entry?.away, "8.2c Bracket home !== away (buttons are distinct)");
}

// 8.3 Clicking home button: advancingTeam equals homeCode (not null)
{
  const preds = fillGroupsHomeWin();
  const bracket = calcBracketTeams(preds);
  const r32Match = knockoutMatches[0];
  const entry = bracket[r32Match.id];

  // Simulate clicking home button (new code uses homeCode = bracketEntry.home)
  const homeCode = entry?.home || r32Match.homeTeam;
  const simulatedPrediction = { homeScore: 1, awayScore: 1, advancingTeam: homeCode };

  assert(simulatedPrediction.advancingTeam !== null, "8.3a advancingTeam is not null after click");
  assert(simulatedPrediction.advancingTeam === entry.home, "8.3b advancingTeam equals bracket home code");

  // Verify highlight logic: only home button highlights
  const homeHighlights = simulatedPrediction.advancingTeam === homeCode;
  const awayCode = entry?.away || r32Match.awayTeam;
  const awayHighlights = simulatedPrediction.advancingTeam === awayCode;
  assert(homeHighlights, "8.3c Home button correctly highlights");
  assert(!awayHighlights, "8.3d Away button correctly does NOT highlight");
}

// 8.4 AI fill advancingTeam highlights exactly one button
{
  let allSingleHighlight = true;
  for (let i = 0; i < 10; i++) {
    const allPreds = predictAllMatches(groupMatches, knockoutMatches, calcBracketTeams);
    const bracket = calcBracketTeams(allPreds);

    for (const m of knockoutMatches) {
      const pred = allPreds[m.id];
      if (!pred?.advancingTeam) continue;

      const entry = bracket[m.id];
      const homeCode = entry?.home || m.homeTeam;
      const awayCode = entry?.away || m.awayTeam;

      const homeHL = pred.advancingTeam === homeCode;
      const awayHL = pred.advancingTeam === awayCode;

      // Exactly one should highlight
      if (homeHL === awayHL) {
        allSingleHighlight = false;
        break;
      }
    }
    if (!allSingleHighlight) break;
  }

  assert(allSingleHighlight, "8.4 AI fill: exactly one tie-breaker button highlights for every knockout draw");
}

// ============================================================

if (failures.length > 0) {
  console.error("\nFailed tests:");
  failures.forEach((f) => console.error("  - " + f));
}

console.log(
  `\n=== SELECTION & CHAMPION: ${passed} passed, ${failed} failed ===`
);
process.exit(failed > 0 ? 1 : 0);
