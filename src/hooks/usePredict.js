import { useEffect, useMemo, useRef, useState } from "react";
import { preferredScrollBehavior } from "../utils/helpers";

// Wait for the DOM to settle (e.g. tab swap, layout change) before we
// scroll/focus. 100ms is enough on a hot device, well below human
// perception. Used by usePredictTabFocus.
const SCROLL_DELAY = 100;

/**
 * Persist the active form's selected stage/group across reloads in
 * sessionStorage. Returns [stage, setStage, group, setGroup] for use in
 * the host component.
 *
 * sessionStorage is per-tab, which is what we want — switching forms in
 * a different tab shouldn't reset position here.
 */
export function usePredictPosition(activeFormId) {
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");

  // Restore on form change.
  useEffect(() => {
    if (!activeFormId) return;
    const saved = sessionStorage.getItem(`predict-pos-${activeFormId}`);
    if (!saved) return;
    try {
      const { stage, group } = JSON.parse(saved);
      if (stage) setSelectedStage(stage);
      if (group) setSelectedGroup(group);
    } catch {
      /* malformed JSON — ignore */
    }
  }, [activeFormId]);

  // Persist on every change.
  useEffect(() => {
    if (!activeFormId) return;
    try {
      sessionStorage.setItem(
        `predict-pos-${activeFormId}`,
        JSON.stringify({ stage: selectedStage, group: selectedGroup }),
      );
    } catch {
      /* quota exceeded / private mode — best effort */
    }
  }, [activeFormId, selectedStage, selectedGroup]);

  return [selectedStage, setSelectedStage, selectedGroup, setSelectedGroup];
}

/**
 * Focus the first unfilled match when the user switches stage or group.
 * If everything in the tab is filled: scroll to the group table (group
 * stage) or to the first match (knockout). Skip on initial mount so we
 * don't open the mobile keyboard unprompted.
 *
 * Inputs:
 *   matchPredictions — the user's per-match predictions map.
 *   canEdit          — whether the user can interact (drives whether to
 *                      focus an input vs. just scroll).
 *   filteredMatches  — the current tab's matches.
 *   selectedStage    — needed for the "everything filled" branch.
 *
 * Refs are used so this effect re-runs only when stage/group/filtered
 * matches change — not on every keystroke.
 */
export function usePredictTabFocus({
  matchPredictions,
  canEdit,
  filteredMatches,
  selectedStage,
  selectedGroup,
}) {
  const predictionsRef = useRef(matchPredictions);
  predictionsRef.current = matchPredictions;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const skipFocusOnMount = useRef(true);

  useEffect(() => {
    if (skipFocusOnMount.current) {
      skipFocusOnMount.current = false;
      return;
    }
    if (!canEditRef.current) return;
    if (filteredMatches.length === 0) return;
    const preds = predictionsRef.current;
    const firstUnfilled = filteredMatches.find((m) => {
      const p = preds[m.id];
      return !p || p.homeScore == null || p.awayScore == null;
    });
    const timer = setTimeout(() => {
      if (firstUnfilled) {
        const container = document.getElementById(`match-${firstUnfilled.id}`);
        if (!container) return;
        const p = predictionsRef.current[firstUnfilled.id];
        const inputs = container.querySelectorAll('input[type="number"]');
        const target = p?.homeScore == null ? inputs[0] : inputs[1];
        container.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
        if (target) {
          target.focus();
          target.select?.();
        }
      } else if (selectedStage === "group") {
        const table = document.querySelector("[data-group-table]");
        table?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
      } else {
        const first = filteredMatches[0];
        const container = document.getElementById(`match-${first.id}`);
        container?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
      }
    }, SCROLL_DELAY);
    return () => clearTimeout(timer);
  }, [selectedStage, selectedGroup, filteredMatches]);
}

/**
 * Project allPredictions to a stable "candidates for duplicate-name
 * check" map (only submitted/approved/pending forms with name + status).
 * This view is referentially stable across unrelated other-user edits
 * (score changes, drafts being saved), which would otherwise re-run
 * validateForm on every keystroke anywhere in the tournament — quadratic
 * on a busy day.
 *
 * Two-stage memoization:
 *   1) compute a sorted key string from allPredictions
 *   2) recompute the projected map ONLY when the key changes
 * That guarantees `view` keeps the same reference across unrelated
 * cache notifications.
 */
export function usePredictDuplicateNameView(allPredictions) {
  const submittedNamesKey = useMemo(() => {
    const parts = [];
    for (const [fid, f] of Object.entries(allPredictions || {})) {
      if (
        f.status === "submitted" ||
        f.status === "approved" ||
        f.status === "pending"
      ) {
        parts.push(`${fid}:${f.status}:${(f.formName || "").trim().toLowerCase()}`);
      }
    }
    return parts.sort().join("|");
  }, [allPredictions]);

  return useMemo(() => {
    const view = {};
    for (const [fid, f] of Object.entries(allPredictions || {})) {
      if (
        f.status === "submitted" ||
        f.status === "approved" ||
        f.status === "pending"
      ) {
        view[fid] = { formName: f.formName, status: f.status };
      }
    }
    return view;
    // Intentional: we want recomputation gated on the key string, not
    // on the source map's identity. eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedNamesKey]);
}
