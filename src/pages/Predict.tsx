import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import {
  useCurrentUser,
  useUserForms,
  useActiveFormId,
  useFormData,
  useSettings,
  useAllPredictions,
} from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import {
  savePrediction,
  savePredictionsBatch,
  saveBonusPrediction,
  updateFormDetails,
  submitPredictions,
  reopenForm,
  setActiveFormId,
} from "../store";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getFilteredMatches } from "../utils/matchFiltering";
import { getCachedBracket, getCachedChampion } from "../utils/bracketCache";
import { calcBracketTeams } from "../utils/bracket";
import { predictAllMatches, getPredictedChampion } from "../utils/fifaPredictor";
import { predictScenario, pickTopScorerForTeam } from "../utils/scenarioPredictor";
import { normalizeStatus, preferredScrollBehavior } from "../utils/helpers";
import MatchCard from "../components/MatchCard";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import StageSelector from "../components/StageSelector";
import FormsHub from "../components/FormsHub";
import Badge from "../components/Badge";
import ProgressHub from "../components/ProgressHub";
import { useRightRail } from "../hooks/useRail";
import {
  usePredictPosition,
  usePredictTabFocus,
  usePredictDuplicateNameView,
} from "../hooks/usePredict";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmModal";
import SaveIndicator from "../components/SaveIndicator";
import ReviewScreen from "../components/ReviewScreen";
import MatchSearch from "../components/MatchSearch";
import PlayerAutocomplete from "../components/PlayerAutocomplete";
import AIFillOverlay from "../components/AIFillOverlay";
import FinalistsPickerModal from "../components/FinalistsPickerModal";
import InlineError from "../components/InlineError";
import ExportFormButtons from "../components/ExportFormButtons";
import { TOP_SCORER_PLAYERS } from "../data/players";
import { validateForm } from "../utils/formValidation";
import { LABELS } from "../constants/messages";

import { getStageLabel } from "../utils/constants";
const EMPTY_MATCHES = {};
const SCROLL_DELAY = 100; // ms to wait for DOM before scrollIntoView

export default function Predict() {
  const { user } = useCurrentUser();
  const { navigate, params, setParamsPatch } = useNavigation();
  const showToast = useToast();
  const confirm = useConfirm();
  const forms = useUserForms(user?.id);
  const storeActiveFormId = useActiveFormId();
  // The URL is now the source of truth for the active form. Store's
  // activeFormId stays in sync via the effect below so cross-tab listeners
  // and other consumers that read it directly continue to work.
  const activeFormId = (params?.form as string) || null;
  const formData = useFormData(activeFormId);
  const settings = useSettings();

  // Sync the URL → store. Fires whenever the URL form id changes (including
  // initial load and Back/Forward navigation).
  useEffect(() => {
    if (storeActiveFormId !== activeFormId) {
      setActiveFormId(activeFormId);
    }
  }, [activeFormId, storeActiveFormId]);

  // When a fresh form is opened with no name yet, focus the name input so
  // the user starts where they need to start. Only on desktop (pointer:fine)
  // — on phones we don't want the keyboard popping up unannounced.
  const focusedFormIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeFormId || focusedFormIdRef.current === activeFormId) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    focusedFormIdRef.current = activeFormId;
    setTimeout(() => {
      const el = document.getElementById("input-formName") as HTMLInputElement | null;
      if (el && !el.value) el.focus({ preventScroll: true });
    }, 80);
  }, [activeFormId]);

  // Clear stale active-form pointer on mount only when it no longer maps to
  // a form the user owns (e.g. the form was deleted). Keeping a valid pointer
  // preserves the user's editing context when navigating back to /predict.
  useEffect(() => {
    if (!activeFormId) return;
    const stillExists = forms.some((f) => f.formId === activeFormId);
    if (!stillExists) setParamsPatch({ form: null, stage: null, group: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage/group selection driven by URL params. usePredictPosition keeps
  // session-storage as a fallback bootstrap when the URL has no values.
  const [selectedStage, setSelectedStage, selectedGroup, setSelectedGroup] =
    usePredictPosition(activeFormId);
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Per-field errors are quiet until the user has attempted to submit at
  // least once, OR the field has been blurred after a touch. Avoids
  // shouting at the user when they just opened a fresh form.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  // Modal/view state lives in the URL so Back closes them and refresh
  // preserves them. The locals below are derived per render; we don't keep
  // duplicate React state for them.
  const showConfirm = params?.modal === "review";
  const showSearch = params?.modal === "search";
  const showScenarioModal = params?.modal === "scenario";
  const allPredictions = useAllPredictions();

  const activeForm =
    activeFormId && formData?.userId === user?.id ? formData : null;
  const status = normalizeStatus(activeForm?.status);
  const canEdit = status === "draft" && !settings.predictionsLocked;

  // If a form we were actively viewing disappears mid-session — e.g. an admin
  // transferred its ownership to someone else, or it was deleted in another
  // tab — the mount-only guard above won't fire. We track that we'd actually
  // rendered THIS form (so a still-loading pointer is never clobbered), and
  // when it vanishes we drop the stale URL param so the page falls back
  // cleanly to the forms hub instead of stranding the user on a blank view.
  const seenActiveFormRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeForm) {
      seenActiveFormRef.current = activeFormId;
      return;
    }
    if (activeFormId && seenActiveFormRef.current === activeFormId) {
      seenActiveFormRef.current = null;
      setParamsPatch({ form: null, stage: null, group: null });
    }
  }, [activeForm, activeFormId, setParamsPatch]);

  const matchPredictions = activeForm?.matches || EMPTY_MATCHES;
  const bracketTeams = useMemo(
    () => getCachedBracket(matchPredictions),
    [matchPredictions],
  );
  const championCode = useMemo(
    () => getCachedChampion(matchPredictions),
    [matchPredictions],
  );
  const championName = championCode ? getTeamByCode(championCode)?.name : null;

  // All useMemo hooks must be above early returns to preserve hook call order
  const predictedGroupMatches = useMemo(() => groupMatches.filter(
    (m) =>
      matchPredictions[m.id]?.homeScore != null &&
      matchPredictions[m.id]?.awayScore != null,
  ).length, [matchPredictions]);
  const predictedKnockout = useMemo(() => knockoutMatches.filter(
    (m) =>
      matchPredictions[m.id]?.homeScore != null &&
      matchPredictions[m.id]?.awayScore != null,
  ).length, [matchPredictions]);
  const filteredMatches = useMemo(
    () => getFilteredMatches(selectedStage, selectedGroup),
    [selectedStage, selectedGroup]);

  // Live validation: errors visible while the user is filling. The
  // duplicate-name candidates view is referentially stable across
  // unrelated other-user edits — see usePredictDuplicateNameView.
  const submittedNamesView = usePredictDuplicateNameView(allPredictions);
  const liveErrors = useMemo(() => {
    if (!activeForm) return [];
    return validateForm(activeForm, activeFormId, submittedNamesView, settings);
  }, [activeForm, activeFormId, submittedNamesView, settings]);
  const isFormValid = liveErrors.length === 0;

  // Map per-field errors so each input can show its own message inline.
  // We only surface a field's error if the user attempted submit OR they
  // touched and blurred that specific field — otherwise a fresh form lights
  // up red on first render which is hostile.
  const fieldErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of liveErrors) {
      const f = (e as any).target?.field;
      if (!f) continue;
      if (!map[f]) map[f] = e.label;
    }
    return map;
  }, [liveErrors]);

  const showFieldError = (field: string) =>
    (attemptedSubmit || touchedFields[field]) ? fieldErrors[field] : undefined;
  const markTouched = useCallback((field: string) => {
    setTouchedFields((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  // On stage/group change, focus the first unfilled match and scroll it
  // into view. Implementation lives in usePredictTabFocus so the long
  // chain of refs / DOM queries / selection logic doesn't clutter this
  // component body.
  usePredictTabFocus({
    matchPredictions,
    canEdit,
    filteredMatches,
    selectedStage,
    selectedGroup,
  });

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!activeFormId || !canEdit) return;
      savePrediction(activeFormId, matchId, prediction);
    },
    [activeFormId, canEdit],
  );

  // Stable per-match callback refs to avoid inline arrow functions in map
  const matchCallbacksRef = useRef({});
  const getMatchCallback = useCallback((matchId) => {
    if (!matchCallbacksRef.current[matchId]) {
      matchCallbacksRef.current[matchId] = (pred) => handlePredictionChange(matchId, pred);
    }
    return matchCallbacksRef.current[matchId];
  }, [handlePredictionChange]);
  // Reset callbacks when handler changes
  useEffect(() => {
    matchCallbacksRef.current = {};
  }, [handlePredictionChange]);

  const handleSubmit = useCallback(() => {
    if (!activeFormId || submitting) return;
    setSubmitting(true);
    submitPredictions(activeFormId);
    setParamsPatch({ modal: null });
    setValidationErrors([]);
    showToast("נקלט. בהצלחה!");
    // Respect the user's motion preference: skip confetti if they asked for
    // reduced motion at the OS level.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      if (!prefersReducedMotion) {
        confetti({
          particleCount: 140,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#58CC02", "#1CB0F6", "#FF9600", "#FFC800", "#CE82FF"],
          zIndex: 99999,
        });
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 100,
            origin: { y: 0.4 },
            colors: ["#58CC02", "#1CB0F6", "#FF9600"],
            zIndex: 99999,
          });
        }, 250);
      }
    } catch { /* confetti is cosmetic — never block submit */ }
    setSubmitting(false);
    // Return to form list (drop form + sub-state from URL)
    navigate("predict", {});
  }, [activeFormId, submitting, showToast, navigate]);

  // Map validation error targets to scroll/navigate actions. After scroll,
  // we also focus the input itself — without focus, the user lands beside
  // the offending field but has to tap it manually before they can fix it.
  // On mobile we deliberately don't auto-focus number inputs — that pops
  // the keyboard mid-scroll which is jarring; we only focus text/select.
  const scrollToTarget = useCallback((target) => {
    if (!target) return undefined;
    return () => {
      if (target.field) {
        setTimeout(() => {
          const wrap = document.getElementById(`field-${target.field}`);
          if (!wrap) return;
          wrap.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' });
          const input = wrap.querySelector(
            'input:not([type="number"]), select, textarea',
          ) as HTMLElement | null;
          input?.focus({ preventScroll: true });
        }, SCROLL_DELAY);
      } else if (target.matchId) {
        if (target.stage === "group" && target.group) {
          setSelectedStage("group");
          setSelectedGroup(target.group);
        } else if (target.stage) {
          setSelectedStage(target.stage);
        }
        setTimeout(() => {
          const card = document.getElementById(`match-${target.matchId}`);
          if (!card) return;
          card.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
        }, SCROLL_DELAY);
      }
    };
  }, [setSelectedStage, setSelectedGroup]);

  const handleTrySubmit = useCallback(() => {
    if (!activeFormId || !activeForm) return;
    const rawErrors = validateForm(activeForm, activeFormId, allPredictions, settings);
    const errors = rawErrors.map((e) => ({ label: e.label, action: scrollToTarget(e.target) }));
    setValidationErrors(errors);
    // Reveal all per-field errors after first submit attempt, even on
    // fields the user never blurred. They've now formally asked the form
    // to be checked.
    setAttemptedSubmit(true);
    setParamsPatch({ modal: "review" });
  }, [activeFormId, activeForm, allPredictions, settings, scrollToTarget, setParamsPatch]);

  const [aiProgress, setAiProgress] = useState(null);
  // Cancellation flag: writes happen synchronously after the fake-delay
  // gates, so checking this before each save keeps the form clean if the
  // user backed out mid-progress.
  const aiCancelledRef = useRef(false);

  const handleAICancel = useCallback(() => {
    aiCancelledRef.current = true;
    setAiProgress(null);
  }, []);

  const handleAIFill = useCallback(async () => {
    if (!activeFormId || !canEdit) return;
    const ok = await confirm({
      title: "מילוי עם AI",
      message: `הניחושים החסרים ימולאו בעזרת AI. ניחושים קיימים ו${LABELS.topScorer} שנבחר יישמרו`,
      confirmLabel: "מלא",
    });
    if (!ok) return;

    const totalSteps = 3;
    aiCancelledRef.current = false;

    try {
      // Step 1: "Analyzing" (fake delay for UX)
      setAiProgress({ current: 1, total: totalSteps });
      await new Promise((r) => setTimeout(r, 1200));
      if (aiCancelledRef.current) return;

      // Fill only missing predictions; user's filled matches are preserved
      // verbatim, and the knockout cascade uses them for continuity.
      const existingMatches = activeForm?.matches || {};
      const allPreds = predictAllMatches(
        groupMatches,
        knockoutMatches,
        calcBracketTeams,
        existingMatches,
      );

      // Step 2: "Computing bracket"
      setAiProgress({ current: 2, total: totalSteps });
      await new Promise((r) => setTimeout(r, 1000));
      if (aiCancelledRef.current) return;

      // Save all predictions in one batch (preserved ones are unchanged)
      savePredictionsBatch(activeFormId, allPreds);

      // Step 3: Top scorer — keep user's choice if already set
      setAiProgress({ current: 3, total: totalSteps });
      await new Promise((r) => setTimeout(r, 800));
      if (aiCancelledRef.current) return;

      if (!activeForm?.topScorer) {
        const playerList = settings.topScorerPlayers?.length > 0 ? settings.topScorerPlayers : TOP_SCORER_PLAYERS;
        const champion = getPredictedChampion(allPreds, calcBracketTeams);
        const player = champion ? pickTopScorerForTeam(champion, playerList) : null;
        if (player) {
          saveBonusPrediction(activeFormId, "topScorer", player.nameHe || player.name);
        }
      }

      showToast("הניחושים החסרים מולאו בעזרת AI! 🤖✨");
    } catch (err) {
      showToast(`שגיאה: ${err.message}`);
    } finally {
      if (!aiCancelledRef.current) setAiProgress(null);
    }
  }, [activeFormId, canEdit, activeForm, settings, showToast, confirm]);

  const handleScenarioFill = useCallback(async (champion, runnerUp) => {
    if (!activeFormId || !canEdit) return;
    setParamsPatch({ modal: null });

    const totalSteps = 3;
    aiCancelledRef.current = false;
    try {
      setAiProgress({ current: 1, total: totalSteps });
      await new Promise((r) => setTimeout(r, 1000));
      if (aiCancelledRef.current) return;

      const existingMatches = activeForm?.matches || {};
      const allPreds = predictScenario(
        champion,
        runnerUp,
        groupMatches,
        knockoutMatches,
        calcBracketTeams,
        existingMatches,
      );

      setAiProgress({ current: 2, total: totalSteps });
      await new Promise((r) => setTimeout(r, 900));
      if (aiCancelledRef.current) return;

      savePredictionsBatch(activeFormId, allPreds);
      saveBonusPrediction(activeFormId, "chosenChampion", champion);
      saveBonusPrediction(activeFormId, "chosenRunnerUp", runnerUp);

      setAiProgress({ current: 3, total: totalSteps });
      await new Promise((r) => setTimeout(r, 700));
      if (aiCancelledRef.current) return;

      // Top scorer from the champion squad (don't override user's existing pick)
      if (!activeForm?.topScorer) {
        const playerList = settings.topScorerPlayers?.length > 0 ? settings.topScorerPlayers : TOP_SCORER_PLAYERS;
        const player = pickTopScorerForTeam(champion, playerList);
        if (player) {
          saveBonusPrediction(activeFormId, "topScorer", player.nameHe || player.name);
        }
      }

      showToast("התרחיש נוצר! הטופס מלא לפי האלופה שבחרת 🏆✨");
    } catch (err) {
      showToast(`שגיאה: ${err.message}`);
    } finally {
      if (!aiCancelledRef.current) setAiProgress(null);
    }
  }, [activeFormId, canEdit, activeForm, settings, showToast, setParamsPatch]);

  const handleMatchJump = useCallback((match) => {
    if (match.stage === "group") {
      setSelectedStage("group");
      setSelectedGroup(match.group);
    } else {
      setSelectedStage(match.stage);
    }
    setTimeout(() => {
      document
        .getElementById(`match-${match.id}`)
        ?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
    }, SCROLL_DELAY);
  }, [setSelectedStage, setSelectedGroup]);

  // Desktop right-rail: show ProgressHub while actively editing a form.
  const railNode = useMemo(() => {
    if (!activeForm) return null;
    return (
      <ProgressHub
        groupMatches={groupMatches}
        knockoutMatches={knockoutMatches}
        matchPredictions={matchPredictions}
        onSelectGroup={(g) => { setSelectedStage("group"); setSelectedGroup(g); }}
        onSelectStage={(s) => setSelectedStage(s)}
      />
    );
  }, [activeForm, matchPredictions]);
  useRightRail(railNode);

  // Guest visitor: hand off to FormsHub. The hub renders its own
  // LoginPrompt banner above the tabs and an EmptyState for the empty
  // "mine" view, so we DON'T add a second prompt here — that previously
  // produced two stacked sign-in cards on the mine tab.
  if (!user) {
    return <FormsHub forms={[]} user={null} settings={settings} />;
  }

  if (!activeForm) {
    return <FormsHub forms={forms} user={user} settings={settings} />;
  }

  // === FORM EDITING VIEW ===
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("predict", {})}
            className="text-sm text-secondary font-extrabold bg-transparent border-none cursor-pointer p-0 hover:text-secondary-dark inline-flex items-center gap-1"
          >
            הטפסים שלי
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <span className="text-ink-light">|</span>
          <h1 className="text-lg font-extrabold text-ink truncate">
            {activeForm.formName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator />
          {status === "submitted" && <Badge variant="primary" icon="✅">הוגש</Badge>}
          {settings.predictionsLocked && <Badge variant="danger" icon="🔒">נסגר</Badge>}
        </div>
      </div>

      {activeForm?.status === "pending" && (
        <div className="border-2 border-accent rounded-2xl p-4 mb-4 text-center" style={{ background: "var(--color-accent-soft)" }}>
          <div className="text-3xl mb-1">⏳</div>
          <div className="text-base font-extrabold text-accent-text">
            הטופס ממתין לאישור
          </div>
          <div className="text-xs text-accent-text mt-1 font-medium">
            הטופס עדיין לא מופיע בטבלת הדירוג עד לאישור מנהל.
          </div>
          {!settings.predictionsLocked && (
            <button
              onClick={() => reopenForm(activeFormId)}
              className="btn-duo-flat mt-3"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              פתח לעריכה
            </button>
          )}
        </div>
      )}
      {status === "submitted" && activeForm?.status !== "pending" && (
        <div className="border-2 border-primary rounded-2xl p-4 mb-4 text-center" style={{ background: "var(--color-primary-soft)" }}>
          <div className="text-3xl mb-1">✅</div>
          <div className="text-base font-extrabold text-primary-dark">הטופס הוגש</div>
          <div className="text-xs text-primary-dark mt-1 font-medium">
            הניחושים נעולים ויחושבו כאשר משחקים יתקיימו.
          </div>
          {!settings.predictionsLocked && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "פתיחת טופס שהוגש",
                  message:
                    "הטופס כבר אושר ונכלל בדירוג. פתיחה מחדש תחזיר אותו לטיוטה — תצטרך להגיש שוב, והמנהל יצטרך לאשר מחדש.",
                  confirmLabel: "פתח לעריכה",
                });
                if (!ok) return;
                reopenForm(activeFormId);
                showToast("הטופס נפתח לעריכה");
              }}
              className="btn-duo-flat mt-3"
              style={{ background: "var(--color-primary)", color: "white" }}
            >
              פתח לעריכה
            </button>
          )}
          <div className="border-t border-primary/20 mt-3 pt-3 flex gap-2 justify-center">
            <ExportFormButtons form={activeForm} userName={user?.displayName} />
          </div>
        </div>
      )}

      <div id="form-details-section" className="card-duo-tight mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div id="field-formName">
            <label htmlFor="input-formName" className="text-xs font-extrabold text-ink-muted">שם הטופס (חובה)</label>
            <input
              id="input-formName"
              value={activeForm.formName || ""}
              onChange={(e) => updateFormDetails(activeFormId, { formName: e.target.value })}
              onBlur={() => markTouched("formName")}
              placeholder="שם הטופס"
              name="formName"
              maxLength={50}
              className={`input-duo input-duo-sm ${showFieldError("formName") ? "border-danger" : ""}`}
              disabled={!canEdit}
              required
              aria-invalid={!!showFieldError("formName")}
              aria-describedby={showFieldError("formName") ? "err-formName" : undefined}
            />
            {showFieldError("formName") && (
              <InlineError className="mt-1 text-xs">
                <span id="err-formName">{showFieldError("formName")}</span>
              </InlineError>
            )}
          </div>
          <div id="field-budget">
            <label htmlFor="input-budget" className="text-xs font-extrabold text-ink-muted">תקציב (חובה)</label>
            <input
              id="input-budget"
              value={activeForm.budgetNumber || ""}
              onChange={(e) => updateFormDetails(activeFormId, { budgetNumber: e.target.value })}
              onBlur={() => markTouched("budget")}
              inputMode="numeric"
              placeholder="100-9999"
              maxLength={4}
              className={`input-duo input-duo-sm ${showFieldError("budget") ? "border-danger" : ""}`}
              disabled={!canEdit}
              required
              aria-invalid={!!showFieldError("budget")}
              aria-describedby={showFieldError("budget") ? "err-budget" : undefined}
            />
            {showFieldError("budget") && (
              <InlineError className="mt-1 text-xs">
                <span id="err-budget">{showFieldError("budget")}</span>
              </InlineError>
            )}
          </div>
          <div id="field-topScorer">
            <label className="text-xs font-extrabold text-ink-muted">{LABELS.topScorer} (חובה)</label>
            <div onBlur={() => markTouched("topScorer")}>
              <PlayerAutocomplete
                value={activeForm.topScorer || ""}
                onChange={(val) => saveBonusPrediction(activeFormId, "topScorer", val)}
                disabled={!canEdit}
                compact
              />
            </div>
            {showFieldError("topScorer") && (
              <InlineError className="mt-1 text-xs">
                <span id="err-topScorer">{showFieldError("topScorer")}</span>
              </InlineError>
            )}
          </div>
        </div>
        {championName && (
          <div className="mt-2 pt-2 border-t-2 border-border text-center text-sm text-accent-text font-extrabold">
            🏆 {LABELS.champion}: {championName}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-ink-muted font-bold truncate">
          {activeForm.formName} ›{" "}
          {selectedStage === "group"
            ? `שלב בתים › בית ${selectedGroup}`
            : getStageLabel(selectedStage)}
        </div>
        <button
          onClick={() => setParamsPatch({ modal: "search" })}
          className="btn-duo-flat"
          style={{ background: "var(--color-secondary)", color: "white", padding: "0.4rem 0.85rem" }}
        >
          🔍 חפש
        </button>
      </div>

      {(
        <>
          <div className="sticky top-16 z-20 bg-bg pt-1 pb-2 -mx-4 px-4 md:mx-0 md:px-0">
            <StageSelector
              selectedStage={selectedStage}
              onSelect={setSelectedStage}
            />
            {selectedStage === "group" && (
              <GroupSelector
                groups={Object.keys(GROUPS)}
                selectedGroup={selectedGroup}
                onSelect={setSelectedGroup}
              />
            )}
          </div>

          {status === "draft" && !settings.predictionsLocked && (
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end">
              <button
                onClick={() => setParamsPatch({ modal: "scenario" })}
                disabled={!!aiProgress}
                title="בחר אלופה וסגנית — הטופס ימולא כך שהן ייפגשו בגמר"
                className="btn-duo btn-duo-orange btn-duo-sm w-full md:w-auto"
              >
                ✨ תרחיש עם AI
              </button>
              <button
                onClick={handleAIFill}
                disabled={!!aiProgress}
                title="ממלא את כל הניחושים בעזרת בינה מלאכותית"
                className="btn-duo btn-duo-blue btn-duo-sm w-full md:w-auto"
              >
                🤖 מלא הכל
              </button>
              <button
                onClick={handleTrySubmit}
                className="btn-duo btn-duo-primary w-full md:w-auto md:min-w-[200px]"
                title={isFormValid ? "הגש את הטופס" : `חסרים ${liveErrors.length} פרטים`}
              >
                {isFormValid
                  ? "הגש טופס ✓"
                  : `הגש טופס (חסרים ${liveErrors.length})`}
              </button>
            </div>
          )}

          {selectedStage === "group" && (
            <GroupTable matchData={matchPredictions} group={selectedGroup} />
          )}

          <div className="space-y-2">
            {filteredMatches.map((match) => (
                <div
                  key={match.id}
                  id={`match-${match.id}`}
                  className="scroll-mt-[180px] md:scroll-mt-[200px] xl:scroll-mt-[140px] rounded-2xl"
                >
                  <MatchCard
                    match={match}
                    bracketEntry={bracketTeams[match.id]}
                    prediction={matchPredictions[match.id]}
                    editable={canEdit}
                    isKnockout={match.stage !== "group"}
                    importance={
                      match.stage === "F" || match.stage === "3RD"
                        ? "showcase"
                        : match.stage !== "group"
                          ? "knockout"
                          : "group"
                    }
                    onPredictionChange={getMatchCallback(match.id)}
                  />
                </div>
              ))}
            {filteredMatches.length === 0 && (
              <div className="text-center py-8 text-ink-muted font-medium">
                <p>אין משחקים בשלב הזה</p>
              </div>
            )}
          </div>
        </>
      )}

      {showSearch && (
        <MatchSearch
          groupMatches={groupMatches}
          knockoutMatches={knockoutMatches}
          matchPredictions={matchPredictions}
          bracketTeams={bracketTeams}
          onJump={handleMatchJump}
          onClose={() => setParamsPatch({ modal: null })}
        />
      )}

      <AIFillOverlay aiProgress={aiProgress} onCancel={handleAICancel} />

      {showScenarioModal && (
        <FinalistsPickerModal
          initialChampion={activeForm?.chosenChampion}
          initialRunnerUp={activeForm?.chosenRunnerUp}
          onCancel={() => setParamsPatch({ modal: null })}
          onConfirm={handleScenarioFill}
        />
      )}

      {showConfirm && (
        <ReviewScreen
          errors={validationErrors}
          activeForm={activeForm}
          groupMatchesCount={groupMatches.length}
          knockoutMatchesCount={knockoutMatches.length}
          predictedGroupCount={predictedGroupMatches}
          predictedKnockoutCount={predictedKnockout}
          championName={championName}
          onClose={() => {
            setParamsPatch({ modal: null });
            setValidationErrors([]);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
