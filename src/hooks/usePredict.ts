import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigation } from "./useNavigation";
import { preferredScrollBehavior } from "../utils/helpers";

// Wait for the DOM to settle (e.g. tab swap, layout change) before we
// scroll/focus. 100ms is enough on a hot device, well below human
// perception. Used by usePredictTabFocus.
const SCROLL_DELAY = 100;

const VALID_STAGES = new Set(["group", "R32", "R16", "QF", "SF", "3RD", "F"]);
const VALID_GROUPS = new Set("ABCDEFGHIJKL".split(""));

/**
 * URL-driven stage/group selection. Reads from `?stage=…&group=…` and writes
 * back via setParamsPatch. sessionStorage is preserved as a one-time bootstrap
 * so first navigations to a form (no URL hint) restore the user's last view.
 */
export function usePredictPosition(activeFormId: string | null) {
  const { params, setParamsPatch } = useNavigation();

  const urlStage = (params?.stage as string) || "";
  const urlGroup = (params?.group as string) || "";
  const selectedStage = VALID_STAGES.has(urlStage) ? urlStage : "group";
  const selectedGroup = VALID_GROUPS.has(urlGroup) ? urlGroup : "A";

  // Bootstrap from sessionStorage when the URL has no stage/group yet —
  // happens once per form on first arrival (e.g. clicking a card).
  const bootstrapped = useRef<string | null>(null);
  useEffect(() => {
    if (!activeFormId || bootstrapped.current === activeFormId) return;
    bootstrapped.current = activeFormId;
    if (urlStage || urlGroup) return; // URL wins
    try {
      const saved = sessionStorage.getItem(`predict-pos-${activeFormId}`);
      if (!saved) return;
      const { stage, group } = JSON.parse(saved);
      const patch: Record<string, string | null> = {};
      if (stage && VALID_STAGES.has(stage)) patch.stage = stage;
      if (group && VALID_GROUPS.has(group)) patch.group = group;
      if (Object.keys(patch).length) setParamsPatch(patch, { replace: true });
    } catch {
      /* malformed JSON — ignore */
    }
  }, [activeFormId, urlStage, urlGroup, setParamsPatch]);

  // Persist to sessionStorage on every URL change so future visits can
  // bootstrap from the last viewed position.
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

  const setSelectedStage = useCallback((s: string) => {
    setParamsPatch({ stage: s === "group" ? null : s });
  }, [setParamsPatch]);

  const setSelectedGroup = useCallback((g: string) => {
    setParamsPatch({ group: g === "A" ? null : g });
  }, [setParamsPatch]);

  return [selectedStage, setSelectedStage, selectedGroup, setSelectedGroup] as const;
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
}: {
  matchPredictions: Record<string, any>;
  canEdit: boolean;
  filteredMatches: any[];
  selectedStage: string;
  selectedGroup: string;
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
        const target = (p?.homeScore == null ? inputs[0] : inputs[1]) as HTMLInputElement | undefined;
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
export function usePredictDuplicateNameView(allPredictions: Record<string, any>) {
  const submittedNamesKey = useMemo(() => {
    const parts: string[] = [];
    for (const [fid, fAny] of Object.entries(allPredictions || {})) {
      const f = fAny as any;
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
    const view: Record<string, { formName: string; status: string }> = {};
    for (const [fid, fAny] of Object.entries(allPredictions || {})) {
      const f = fAny as any;
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
