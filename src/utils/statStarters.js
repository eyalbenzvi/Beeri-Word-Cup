// Generate "piquant idea" chips for the admin editor — short, juicy
// observations derived from the per-match stats (or aggregated across the
// whole post). Each chip's `text` is what gets prepended into the relevant
// textarea when clicked; the `label` is what shows on the chip itself
// (often shorter / with an emoji for the writer's eye, but the emoji is
// stripped before insertion so it doesn't end up in the public post).
//
// Pure functions — no React, no I/O. Fed by `summaryStats.computeMatchStats`
// which already exposes lonePicks, consensusFlop, underdogHeroes, etc.

import { computeMatchStats } from "./summaryStats";
import { getMatchById } from "../data/matches";
import { getTeamByCode } from "../data/teams";

// Maximum chips per match panel. More than this and the admin tunes out.
const PER_MATCH_CAP = 4;
// Maximum chips on the global panel (cross-match observations).
const GLOBAL_CAP = 5;

function teamName(code) {
  return getTeamByCode(code)?.name || code || "";
}

function namesList(forms, max = 3) {
  if (!forms || forms.length === 0) return "";
  const names = forms.slice(0, max).map((f) => f.formName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ו${names[1]}`;
  return `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
}

/**
 * Per-match suggestions — render in a panel next to that match's note field.
 * `match` is the matches.js entry; `result` may be undefined if the match
 * hasn't played yet (in which case we return an empty list — there's
 * nothing to be piquant about pre-match).
 *
 * Returns: [{ id, label, text, kind }] — `text` is what gets inserted.
 */
export function getMatchSuggestions({ match, result, allPredictions, users }) {
  if (!match || !result) return [];
  const stats = computeMatchStats({
    matchId: match.id,
    result,
    allPredictions,
    users,
  });
  if (stats.totalForms === 0) return [];

  const home = teamName(match.homeTeam);
  const away = teamName(match.awayTeam);
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
      label: `✅ ${stats.actualScorePct}% קלעו ${result.awayScore}:${result.homeScore} בול`,
      text: `${stats.actualScorePct}% קלעו את ${result.awayScore}:${result.homeScore} בול — היום לא הופתענו.`,
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
export function getGlobalSuggestions({ coveredMatches = [], allPredictions, users }) {
  const out = [];
  const matchesWithResults = coveredMatches.filter((cm) => !!cm.result);

  if (matchesWithResults.length === 0) return [];

  // Collect per-match stats once.
  const allStats = matchesWithResults.map((cm) => ({
    match: cm.match,
    result: cm.result,
    stats: computeMatchStats({
      matchId: cm.match.id,
      result: cm.result,
      allPredictions,
      users,
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
  if (distinctHittersToday.size >= 3) {
    out.push({
      id: "spread",
      label: `🎲 ${distinctHittersToday.size} מנחשים שונים קלעו לפחות פעם אחת היום`,
      text: `${distinctHittersToday.size} מנחשים שונים קלעו לפחות תוצאה מדויקת אחת היום — היום עבד לטובת הרבה אנשים.`,
      kind: "distinctHitters",
    });
  }

  // 3. Whole day was unpredictable
  if (totalUnpredictable >= 2) {
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
  if (bestMatch && bestMatch.stats.exactHitCount >= 5) {
    const home = teamName(bestMatch.match.homeTeam);
    const away = teamName(bestMatch.match.awayTeam);
    out.push({
      id: "easy-call",
      label: `✅ ${bestMatch.stats.exactHitCount} קלעו ${home}–${away} בול`,
      text: `המשחק הכי קל היום: ${bestMatch.stats.exactHitCount} מנחשים קלעו את ${home}–${away} בול.`,
      kind: "easyCall",
    });
  }

  // 5. Total exact hits across the whole post
  if (totalExactHitsToday >= 10) {
    out.push({
      id: "total-exact",
      label: `📈 ${totalExactHitsToday} קליעות מדויקות סה"כ היום`,
      text: `${totalExactHitsToday} קליעות מדויקות סה"כ על פני ${matchesWithResults.length} המשחקים — יום נדיב.`,
      kind: "totalExact",
    });
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
