// Generate "piquant idea" chips for the admin editor — short, juicy
// observations derived from the per-match stats (or aggregated across the
// whole post). Each chip's `text` is what gets prepended into the relevant
// textarea when clicked; the `label` is what shows on the chip itself
// (often shorter / with an emoji for the writer's eye, but the emoji is
// stripped before insertion so it doesn't end up in the public post).
//
// Pure functions — no React, no I/O. Fed by `summaryStats.computeMatchStats`
// which already exposes lonePicks, consensusFlop, underdogHeroes, etc.

import { computeMatchStats, computeFormDayAggregates } from "./summaryStats";
import { getMatchById } from "../data/matches";
import { getTeamByCode } from "../data/teams";

// Maximum chips per match panel. More than this and the admin tunes out.
const PER_MATCH_CAP = 4;
// Maximum chips on the global panel (cross-match observations + per-form
// "who shone" observations). Bumped from 5 to 7 when form-level suggestions
// were added — the editor benefits from a couple of extra angles, but more
// than ~7 starts to look like a wall of chips.
const GLOBAL_CAP = 7;
// Beyond this many forms sharing the same observation, naming them all in
// a chip becomes prose-noise — we either fall back to a count phrasing or
// suppress the chip entirely. Used by every "who shone today" chip.
const FORM_NAMES_MAX = 3;
// Threshold for the "day-top-exact" chip. One or two exacts isn't an
// observation worth a chip, just expected variance. Three+ feels notable.
const MIN_EXACT_FOR_DAY_CHIP = 2;
// Threshold for the "day's-easy-call" chip — at least this many forms
// nailed the same scoreline, otherwise it's not really a "consensus".
const EASY_CALL_MIN_HITS = 5;
// Threshold for the "spread" chip — at least this many distinct forms hit
// at least one exact across the day.
const SPREAD_MIN_DISTINCT = 3;
// Threshold for the "the whole day was wild" chip — at least this many
// matches were unpredictable.
const WILD_DAY_MIN_MATCHES = 2;
// Threshold for the "total exact hits across the post" chip.
const TOTAL_EXACT_MIN = 10;

function teamName(code) {
  return getTeamByCode(code)?.name || code || "";
}

function namesList(forms, max = FORM_NAMES_MAX) {
  if (!forms || forms.length === 0) return "";
  const names = forms.slice(0, max).map((f) => f.formName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ו${names[1]}`;
  return `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
}

// Shared scaffolding for the four "who shone today" form-list chips.
// Every form-list chip follows the same shape:
//   - filter the aggregate list by some predicate (perfect day, zero day,
//     max exact count, etc.)
//   - if 1..FORM_NAMES_MAX forms qualify, push a chip whose copy varies
//     between a "single name" and a "multi name" variant
//   - dedup against the running set of already-named forms
//
// Without this helper we'd repeat the same 15-line block four times. The
// caller supplies the chip id, the kind tag, the predicate (or a
// pre-filtered list), and a small `copy` function that takes the matched
// forms and a `tied` flag and returns `{ label, text }`. Returns the
// pushed chip (or null if suppressed) so the caller can branch on it.
function pushFormListChip(out, namedFormIds, {
  id,
  kind,
  forms,
  copy,
}: {
  id: string;
  kind: string;
  forms: any[];
  copy: (forms: any[], tied: boolean) => { label: string; text: string };
}) {
  if (!forms || forms.length === 0 || forms.length > FORM_NAMES_MAX) return null;
  // Skip when every named candidate is already on a previous chip and we'd
  // be showing exactly one name (multi-name chips are still informative).
  const tied = forms.length > 1;
  if (!tied && namedFormIds.has(forms[0].formId)) return null;
  const { label, text } = copy(forms, tied);
  const chip = { id, label, text, kind };
  out.push(chip);
  if (!tied) namedFormIds.add(forms[0].formId);
  return chip;
}

/**
 * Per-match suggestions — render in a panel next to that match's note field.
 * `match` is the matches.js entry; `result` may be undefined if the match
 * hasn't played yet (in which case we return an empty list — there's
 * nothing to be piquant about pre-match).
 *
 * Returns: [{ id, label, text, kind }] — `text` is what gets inserted.
 */
export function getMatchSuggestions({ match, result, allPredictions, users, actualBracketTeams, getFormBracketTeams }) {
  if (!match || !result) return [];
  const stats = computeMatchStats({
    matchId: match.id,
    result,
    allPredictions,
    users,
    actualBracketTeams,
    getFormBracketTeams,
  });
  if (stats.totalForms === 0) return [];

  // Knockout fixtures carry null homeTeam/awayTeam — fall back to the actual
  // results-gated bracket so the chip copy names the real teams.
  const slot = actualBracketTeams?.[match.id];
  const home = teamName(match.homeTeam || slot?.home);
  const away = teamName(match.awayTeam || slot?.away);
  const out = [];

  // 1. Lone bullseye (1 form nailed it)
  if (stats.lonePicks.length === 1) {
    const f = stats.lonePicks[0];
    out.push({
      id: "lone-1",
      label: `🎯 רק ${f.formName} קלע בדיוק`,
      text: `רק ${f.formName} ראה את זה — ${result.homeScore}:${result.awayScore} בול.`,
      kind: "lonePicks",
    });
  } else if (stats.lonePicks.length >= 2 && stats.lonePicks.length <= 3) {
    const names = namesList(stats.lonePicks);
    out.push({
      id: "lone-few",
      label: `🎯 ${stats.lonePicks.length} קלעו בדיוק: ${stats.lonePicks.map((f) => f.formName).join(", ")}`,
      text: `${stats.lonePicks.length} בלבד קלעו את ${result.homeScore}:${result.awayScore} בול: ${names}.`,
      kind: "lonePicks",
    });
  }

  // 2. Consensus flop (most missed the outcome)
  if (stats.consensusFlop) {
    out.push({
      id: "flop",
      label: `💥 ${stats.consensusFlop.missPct}% טעו בכיוון`,
      text: `${stats.consensusFlop.missPct}% מהמנחשים טעו בכיוון.`,
      kind: "consensusFlop",
    });
  }

  // 3. Underdog hero (minority outcome was right)
  if (stats.underdogHeroes.length >= 1 && stats.underdogHeroes.length <= 5) {
    const names = namesList(stats.underdogHeroes, 3);
    out.push({
      id: "underdog",
      label: `🦄 רק ${stats.underdogHeroes.length} צדקו בכיוון: ${stats.underdogHeroes.map((f) => f.formName).join(", ")}`,
      text: `רק ${stats.underdogHeroes.length} ניחשו נכון את הכיוון: ${names}.`,
      kind: "underdog",
    });
  }

  // 4. Most-predicted scoreline (when it's NOT the actual)
  if (stats.topScores.length > 0 && result) {
    const top = stats.topScores[0];
    const actualKey = `${Number(result.awayScore)}-${Number(result.homeScore)}`;
    if (top.score !== actualKey && top.pct >= 25) {
      out.push({
        id: "consensus-score",
        label: `📊 הרוב הימרו על ${top.score} (${top.pct}%)`,
        text: `${top.pct}% הימרו על ${top.score} — וזה לא מה שקרה.`,
        kind: "topScore",
      });
    }
  }

  // 5. Predicted-and-correct (favorite confirmed)
  if (stats.actualScorePct >= 40) {
    out.push({
      id: "consensus-right",
      label: `✅ ${stats.actualScorePct}% קלעו ${result.homeScore}:${result.awayScore} בול`,
      text: `${stats.actualScorePct}% קלעו את ${result.homeScore}:${result.awayScore} בול — היום לא הופתענו.`,
      kind: "actualConsensus",
    });
  }

  // 6. Wholly unpredictable
  if (stats.wasUnpredictable) {
    out.push({
      id: "unpredictable",
      label: `🌀 ${home}–${away}: כמעט אף אחד לא ראה`,
      text: `${home}–${away} היה היום הכי לא צפוי בלוח.`,
      kind: "unpredictable",
    });
  }

  return out.slice(0, PER_MATCH_CAP);
}

/**
 * Global suggestions — observations across ALL covered matches in this
 * post. Useful for intro and conclusion. `coveredMatches` is an array of
 * `{ match, result }` for each covered match.
 */
export function getGlobalSuggestions({ coveredMatches = [], allPredictions, users, actualBracketTeams, getFormBracketTeams }) {
  const out = [];
  const matchesWithResults = coveredMatches.filter((cm) => !!cm.result);

  if (matchesWithResults.length === 0) return [];

  // Collect per-match stats once. Knockout matches are gated on matchup
  // alignment via the bracket inputs (no-op for group matches).
  const allStats = matchesWithResults.map((cm) => ({
    match: cm.match,
    result: cm.result,
    stats: computeMatchStats({
      matchId: cm.match.id,
      result: cm.result,
      allPredictions,
      users,
      actualBracketTeams,
      getFormBracketTeams,
    }),
  }));

  const totalExactHitsToday = allStats.reduce((sum, s) => sum + s.stats.exactHitCount, 0);
  const totalUnpredictable = allStats.filter((s) => s.stats.wasUnpredictable).length;

  // 1. No one nailed any match exactly
  if (totalExactHitsToday === 0 && allStats.some((s) => s.stats.totalForms > 0)) {
    out.push({
      id: "no-exact-day",
      label: `🏆 אף אחד לא קלע מדויק היום`,
      text: `יום קשה למנחשים — אף אחד לא קלע אפילו תוצאה מדויקת אחת.`,
      kind: "noExactToday",
    });
  }

  // 2. How many distinct forms hit at least one exact today
  const distinctHittersToday = new Set();
  for (const s of allStats) {
    for (const f of s.stats.exactHitForms) {
      distinctHittersToday.add(f.formId);
    }
  }
  if (distinctHittersToday.size >= SPREAD_MIN_DISTINCT) {
    out.push({
      id: "spread",
      label: `🎲 ${distinctHittersToday.size} מנחשים שונים קלעו לפחות פעם אחת היום`,
      text: `${distinctHittersToday.size} מנחשים שונים קלעו לפחות תוצאה מדויקת אחת היום — היום עבד לטובת הרבה אנשים.`,
      kind: "distinctHitters",
    });
  }

  // 3. Whole day was unpredictable
  if (totalUnpredictable >= WILD_DAY_MIN_MATCHES) {
    out.push({
      id: "whole-day-wild",
      label: `⏬ ${totalUnpredictable} משחקים שאף אחד כמעט לא ראה`,
      text: `${totalUnpredictable} מתוך ${matchesWithResults.length} המשחקים היום היו הפתעות גמורות.`,
      kind: "wildDay",
    });
  }

  // 4. The single biggest hit-count of the day (one match where everyone agreed)
  const bestMatch = allStats.reduce(
    (best, s) => (s.stats.exactHitCount > (best?.stats.exactHitCount || 0) ? s : best),
    null,
  );
  if (bestMatch && bestMatch.stats.exactHitCount >= EASY_CALL_MIN_HITS) {
    const slot = actualBracketTeams?.[bestMatch.match.id];
    const home = teamName(bestMatch.match.homeTeam || slot?.home);
    const away = teamName(bestMatch.match.awayTeam || slot?.away);
    out.push({
      id: "easy-call",
      label: `✅ ${bestMatch.stats.exactHitCount} קלעו ${home}–${away} בול`,
      text: `המשחק הכי קל היום: ${bestMatch.stats.exactHitCount} מנחשים קלעו את ${home}–${away} בול.`,
      kind: "easyCall",
    });
  }

  // 5. Total exact hits across the whole post
  if (totalExactHitsToday >= TOTAL_EXACT_MIN) {
    out.push({
      id: "total-exact",
      label: `📈 ${totalExactHitsToday} קליעות מדויקות סה"כ היום`,
      text: `${totalExactHitsToday} קליעות מדויקות סה"כ על פני ${matchesWithResults.length} המשחקים — יום נדיב.`,
      kind: "totalExact",
    });
  }

  // 6+. Form-level "who shone today" suggestions — derived from the per-form
  // aggregates across the covered matches. We surface up to three observations
  // here: the day's top scorer, the most precise form (if distinct from #1),
  // a perfect-outcome form, and — only if it's a multi-match day — a form
  // that filled in every match yet missed every outcome (a memorable zero).
  const formAggregates = computeFormDayAggregates({
    coveredMatches: matchesWithResults,
    allPredictions,
  });

  if (formAggregates.length > 0) {
    // Track which formIds we've already named in a chip — keeps a single
    // form from being congratulated three times in a row when it's both
    // the day's top scorer AND has a perfect outcome AND the most exacts
    // (very common: those three things tend to coincide). Multi-form chips
    // (ties / shared lists) are exempt — those add information.
    const namedFormIds = new Set<string>();
    const isMultiMatchDay = matchesWithResults.length >= WILD_DAY_MIN_MATCHES;

    const topByPoints = formAggregates[0];
    if (topByPoints.totalPoints > 0) {
      const leaders = formAggregates.filter((f) => f.totalPoints === topByPoints.totalPoints);
      pushFormListChip(out, namedFormIds, {
        id: "day-top-points",
        kind: "dayTopPoints",
        forms: leaders,
        copy: (forms, tied) => tied
          ? {
              label: `🏆 ${forms.length} טפסים חלקו את הצמרת היום`,
              text: `${namesList(forms)} חלקו את הראש היום עם ${topByPoints.totalPoints} נקודות כל אחד.`,
            }
          : {
              label: `🏆 ${forms[0].formName} זכה בהכי הרבה נקודות היום (${topByPoints.totalPoints})`,
              text: `${forms[0].formName} זכה בהכי הרבה נקודות מהמשחקים היום (${topByPoints.totalPoints}).`,
            },
      });
    }

    // Most exact hits across the post.
    const maxExact = formAggregates.reduce((m, f) => Math.max(m, f.exactCount), 0);
    if (maxExact >= MIN_EXACT_FOR_DAY_CHIP) {
      const exactLeaders = formAggregates.filter((f) => f.exactCount === maxExact);
      pushFormListChip(out, namedFormIds, {
        id: "day-top-exact",
        kind: "dayTopExact",
        forms: exactLeaders,
        copy: (forms, tied) => tied
          ? {
              label: `🎯 ${forms.length} טפסים עם ${maxExact} קליעות מדויקות היום`,
              text: `${namesList(forms)} קלעו ${maxExact} תוצאות בדיוק כל אחד היום.`,
            }
          : {
              label: `🎯 ${forms[0].formName} עם ${maxExact} קליעות מדויקות היום`,
              text: `${forms[0].formName} קלע ${maxExact} תוצאות בדיוק היום.`,
            },
      });
    }

    // Perfect outcome day — only meaningful on multi-match days.
    if (isMultiMatchDay) {
      const perfectForms = formAggregates.filter((f) => f.perfectOutcome);
      pushFormListChip(out, namedFormIds, {
        id: "day-perfect-outcome",
        kind: "dayPerfectOutcome",
        forms: perfectForms,
        copy: (forms, tied) => tied
          ? {
              label: `✅ ${forms.length} טפסים צדקו בכיוון בכל המשחקים`,
              text: `${forms.length} טפסים — ${namesList(forms)} — צדקו בכיוון של כל המשחקים היום.`,
            }
          : {
              label: `✅ ${forms[0].formName} צדק בכיוון בכל המשחקים היום`,
              text: `${forms[0].formName} צדק בכיוון של כל ${matchesWithResults.length} המשחקים היום.`,
            },
      });

      // Memorable zero day — same shape, opposite sign.
      const zeroForms = formAggregates.filter((f) => f.missedAllOutcome);
      pushFormListChip(out, namedFormIds, {
        id: "day-zero-outcome",
        kind: "dayZeroOutcome",
        forms: zeroForms,
        copy: (forms, tied) => tied
          ? {
              label: `💤 ${forms.length} טפסים סיימו את היום בלי כיוון אחד`,
              text: `${forms.length} טפסים — ${namesList(forms)} — פספסו את הכיוון בכל המשחקים היום.`,
            }
          : {
              label: `💤 ${forms[0].formName} לא צדק באף כיוון היום`,
              text: `${forms[0].formName} פספס את הכיוון בכל המשחקים היום.`,
            },
      });
    }
  }

  return out.slice(0, GLOBAL_CAP);
}

// Helper for callers that only have match IDs and need the (match, result)
// pairs in the shape getGlobalSuggestions expects.
export function pairCoveredMatches(coveredMatchIds = [], matchResults = {}) {
  return coveredMatchIds
    .map((mid) => {
      const m = getMatchById(mid);
      if (!m) return null;
      return { match: m, result: matchResults[mid] };
    })
    .filter(Boolean);
}
