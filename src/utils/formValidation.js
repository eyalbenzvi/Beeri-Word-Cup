import { groupMatches, knockoutMatches } from "../data/matches";
import { getCachedBracket } from "./bracketCache";
import { TOP_SCORER_PLAYERS } from "../data/players";

/**
 * Validates a prediction form and returns an array of error objects.
 * Each error: { key: string, label: string, target?: { stage, group, matchId, field } }
 *
 * Pure logic — no DOM access or React state. UI layer maps `target` to scroll actions.
 */
export function validateForm(activeForm, activeFormId, allPredictions, settings) {
  const errors = [];
  const preds = activeForm?.matches || {};

  // 1. Missing group match predictions
  const missingGroup = groupMatches.filter(
    (m) => preds[m.id]?.homeScore == null || preds[m.id]?.awayScore == null,
  );
  if (missingGroup.length > 0) {
    errors.push({
      key: "missingGroup",
      label: `${missingGroup.length} משחקי בתים חסרים`,
      target: { stage: "group", group: missingGroup[0].group, matchId: missingGroup[0].id },
    });
  }

  // 2. Missing knockout match predictions
  const missingKnockout = knockoutMatches.filter(
    (m) => preds[m.id]?.homeScore == null || preds[m.id]?.awayScore == null,
  );
  if (missingKnockout.length > 0) {
    errors.push({
      key: "missingKnockout",
      label: `${missingKnockout.length} משחקי נוקאאוט חסרים`,
      target: { stage: missingKnockout[0].stage, matchId: missingKnockout[0].id },
    });
  }

  // 3. Knockout ties without advancing team
  const bracket = getCachedBracket(preds);
  const unresolvedTies = knockoutMatches.filter((m) => {
    const pred = preds[m.id];
    if (!pred || pred.homeScore == null || pred.awayScore == null) return false;
    if (pred.homeScore !== pred.awayScore) return false;
    const teams = bracket[m.id];
    return (
      !pred.advancingTeam ||
      (teams && pred.advancingTeam !== teams.home && pred.advancingTeam !== teams.away)
    );
  });
  if (unresolvedTies.length > 0) {
    errors.push({
      key: "unresolvedTie",
      label: `${unresolvedTies.length} תיקו בנוקאאוט בלי בחירת מי עולה`,
      target: { stage: unresolvedTies[0].stage, matchId: unresolvedTies[0].id },
    });
  }

  // 4. Top scorer
  if (!activeForm?.topScorer?.trim()) {
    errors.push({
      key: "missingTopScorer",
      label: "לא הוכנס מלך שערים",
      target: { field: "topScorer" },
    });
  } else {
    const playerList = settings?.topScorerPlayers?.length > 0 ? settings.topScorerPlayers : TOP_SCORER_PLAYERS;
    const isValid = playerList.some((p) => p.name === activeForm.topScorer.trim());
    if (!isValid) {
      errors.push({
        key: "invalidTopScorer",
        label: "מלך שערים חייב להיבחר מהרשימה",
        target: { field: "topScorer" },
      });
    }
  }

  // 5. Form name
  if (!activeForm?.formName?.trim()) {
    errors.push({
      key: "missingFormName",
      label: "לא הוכנס שם טופס",
      target: { field: "formName" },
    });
  } else {
    const trimmedName = activeForm.formName.trim().toLowerCase();
    const duplicateName = Object.entries(allPredictions || {}).some(
      ([fid, f]) =>
        fid !== activeFormId &&
        f.formName?.trim().toLowerCase() === trimmedName &&
        (f.status === "submitted" || f.status === "approved" || f.status === "pending"),
    );
    if (duplicateName) {
      errors.push({
        key: "duplicateFormName",
        label: "כבר קיים טופס שהוגש עם שם זהה. בחר שם אחר",
        target: { field: "formName" },
      });
    }
  }

  // 6. Budget number
  const budget = activeForm?.budgetNumber;
  if (!budget || !/^\d+$/.test(budget) || parseInt(budget) < 100 || parseInt(budget) > 9999) {
    errors.push({
      key: "invalidBudget",
      label: "מספר תקציב חייב להיות מספר שלם בין 100 ל-9999",
      target: { field: "budget" },
    });
  }

  return errors;
}
