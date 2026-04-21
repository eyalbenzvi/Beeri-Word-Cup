import React, { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
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
import { predictAllMatches } from "../utils/fifaPredictor";
import { normalizeStatus } from "../utils/helpers";
import MatchCard from "../components/MatchCard";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import StageSelector from "../components/StageSelector";
import FormList from "../components/FormList";
import FormDetailsTab from "../components/FormDetailsTab";
const AllFormsView = React.lazy(() => import("./AllForms"));
import { useToast } from "../components/Toast";
import SaveIndicator from "../components/SaveIndicator";
import ReviewScreen from "../components/ReviewScreen";
import MatchSearch from "../components/MatchSearch";
import PlayerAutocomplete from "../components/PlayerAutocomplete";
import AIFillOverlay from "../components/AIFillOverlay";
import { TOP_SCORER_PLAYERS } from "../data/players";
import { validateForm } from "../utils/formValidation";

import { KNOCKOUT_STAGE_ORDER as knockoutStageOrder, getStageLabel, STAGE_LABELS } from "../utils/constants";
const EMPTY_MATCHES = {};
const SCROLL_DELAY = 100; // ms to wait for DOM before scrollIntoView

export default function Predict() {
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const showToast = useToast();
  const forms = useUserForms(user?.id);
  const activeFormId = useActiveFormId();
  const formData = useFormData(activeFormId);
  const settings = useSettings();

  useEffect(() => {
    setActiveFormId(null);
  }, []);
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [activeTab, setActiveTab] = useState("matches");
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [showAllForms, setShowAllForms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const allPredictions = useAllPredictions();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!window.visualViewport) return;
    const handler = () => {
      setKeyboardOpen(window.visualViewport.height < window.innerHeight * 0.75);
    };
    window.visualViewport.addEventListener('resize', handler);
    return () => window.visualViewport.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!activeFormId) return;
    const saved = sessionStorage.getItem(`predict-pos-${activeFormId}`);
    if (saved) {
      try {
        const { stage, group } = JSON.parse(saved);
        if (stage) setSelectedStage(stage);
        if (group) setSelectedGroup(group);
      } catch {}
    }
  }, [activeFormId]);

  useEffect(() => {
    if (!activeFormId) return;
    sessionStorage.setItem(
      `predict-pos-${activeFormId}`,
      JSON.stringify({ stage: selectedStage, group: selectedGroup }),
    );
  }, [activeFormId, selectedStage, selectedGroup]);

  const activeForm =
    activeFormId && formData?.userId === user?.id ? formData : null;
  const status = normalizeStatus(activeForm?.status);
  const canEdit = status === "draft" && !settings.predictionsLocked;

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

  // Focus the first unfilled match when the user switches tabs (stage or group).
  // If everything in the tab is filled: scroll to the group table for the group
  // stage, or to the first match for knockout stages. Skip on initial mount so
  // we don't open the mobile keyboard unprompted.
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
        container.scrollIntoView({ behavior: "smooth", block: "start" });
        if (target) {
          target.focus();
          target.select?.();
        }
      } else if (selectedStage === "group") {
        const table = document.querySelector("[data-group-table]");
        table?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const first = filteredMatches[0];
        const container = document.getElementById(`match-${first.id}`);
        container?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, SCROLL_DELAY);
    return () => clearTimeout(timer);
  }, [selectedStage, selectedGroup, filteredMatches]);

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
    setShowConfirm(false);
    setValidationErrors([]);
    showToast("הטופס הוגש בהצלחה! 🎉");
    setSubmitting(false);
    setActiveFormId(null); // return to form list
  }, [activeFormId, submitting, showToast]);

  // Map validation error targets to scroll/navigate actions
  const scrollToTarget = useCallback((target) => {
    if (!target) return undefined;
    return () => {
      if (target.field) {
        setTimeout(() => document.getElementById(`field-${target.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), SCROLL_DELAY);
      } else if (target.matchId) {
        if (target.stage === "group" && target.group) {
          setSelectedStage("group");
          setSelectedGroup(target.group);
        } else if (target.stage) {
          setSelectedStage(target.stage);
        }
        setActiveTab("matches");
        setTimeout(() => document.getElementById(`match-${target.matchId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), SCROLL_DELAY);
      }
    };
  }, []);

  const handleTrySubmit = useCallback(() => {
    if (!activeFormId || !activeForm) return;
    const rawErrors = validateForm(activeForm, activeFormId, allPredictions, settings);
    const errors = rawErrors.map((e) => ({ label: e.label, action: scrollToTarget(e.target) }));
    setValidationErrors(errors);
    setShowConfirm(true);
  }, [activeFormId, activeForm, allPredictions, settings, scrollToTarget]);

  const [aiProgress, setAiProgress] = useState(null);

  const handleAIFill = useCallback(async () => {
    if (!activeFormId || !canEdit) return;
    if (!window.confirm("הניחושים החסרים ימולאו בעזרת AI. ניחושים קיימים ומלך שערים שנבחר יישמרו. להמשיך?")) return;

    const totalSteps = 3;

    try {
      // Step 1: "Analyzing" (fake delay for UX)
      setAiProgress({ current: 1, total: totalSteps });
      await new Promise((r) => setTimeout(r, 1200));

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

      // Save all predictions in one batch (preserved ones are unchanged)
      savePredictionsBatch(activeFormId, allPreds);

      // Step 3: Top scorer — keep user's choice if already set
      setAiProgress({ current: 3, total: totalSteps });
      await new Promise((r) => setTimeout(r, 800));

      if (!activeForm?.topScorer) {
        const playerList = settings.topScorerPlayers?.length > 0 ? settings.topScorerPlayers : TOP_SCORER_PLAYERS;
        const randomPlayer = playerList[Math.floor(Math.random() * playerList.length)];
        saveBonusPrediction(activeFormId, "topScorer", randomPlayer.nameHe || randomPlayer.name);
      }

      showToast("הניחושים החסרים מולאו בעזרת AI! 🤖✨");
    } catch (err) {
      showToast(`שגיאה: ${err.message}`);
    } finally {
      setAiProgress(null);
    }
  }, [activeFormId, canEdit, activeForm, settings, showToast]);

  const handleMatchJump = useCallback((match) => {
    if (match.stage === "group") {
      setSelectedStage("group");
      setSelectedGroup(match.group);
    } else {
      setSelectedStage(match.stage);
    }
    setActiveTab("matches");
    setTimeout(() => {
      document
        .getElementById(`match-${match.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, SCROLL_DELAY);
  }, []);

  if (!user) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-extrabold text-gray-700 mb-2">
          הצטרף למשחק קודם
        </h2>
        <p className="text-gray-400 text-sm mb-5">
          צריך לבחור שם כדי למלא ניחושים
        </p>
        <button
          onClick={() => navigate("login")}
          className="bg-primary text-white font-bold px-8 py-3.5 rounded-2xl hover:bg-primary-light transition border-none cursor-pointer shadow-sm text-base"
        >
          התחבר למשחק
        </button>
      </div>
    );
  }

  if (!activeForm && showAllForms) {
    return (
      <Suspense fallback={<div className="text-center py-8 text-gray-400">טוען...</div>}>
        <AllFormsView onBack={() => setShowAllForms(false)} />
      </Suspense>
    );
  }

  if (!activeForm) {
    return (
      <FormList
        forms={forms}
        user={user}
        settings={settings}
        onShowAllForms={() => setShowAllForms(true)}
      />
    );
  }

  // === FORM EDITING VIEW ===
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveFormId(null)}
            className="text-sm text-primary font-medium bg-transparent border-none cursor-pointer p-0"
          >
            הטפסים שלי →
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-bold text-primary truncate">
            {activeForm.formName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator />
          {status === "submitted" && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              ✅ הוגש
            </span>
          )}
          {settings.predictionsLocked && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">
              🔒 ההגשה נסגרה
            </span>
          )}
        </div>
      </div>

      {activeForm?.status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">⏳</div>
          <div className="text-sm font-semibold text-amber-700">
            הטופס ממתין לאישור
          </div>
          <div className="text-xs text-amber-600 mt-1">
            הטופס עדיין לא מופיע בטבלת הדירוג עד לאישור מנהל.
          </div>
        </div>
      )}
      {status === "submitted" && activeForm?.status !== "pending" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-semibold text-green-700">הטופס הוגש</div>
          <div className="text-xs text-green-600 mt-1">
            הניחושים נעולים ויחושבו כאשר משחקים יתקיימו.
          </div>
          {!settings.predictionsLocked && (
            <button
              onClick={() => reopenForm(activeFormId)}
              className="mt-2 text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-200 transition"
            >
              פתח לעריכה
            </button>
          )}
        </div>
      )}

      <div id="form-details-section" className="bg-white rounded-2xl p-3 border border-border shadow-sm mb-3">
        <div className="grid grid-cols-3 gap-2">
          <div id="field-formName">
            <label className="text-[11px] font-semibold text-ink-muted">שם הטופס</label>
            <input
              value={activeForm.formName || ""}
              onChange={(e) => updateFormDetails(activeFormId, { formName: e.target.value })}
              placeholder="שם הטופס"
              name="formName"
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
              disabled={!canEdit}
            />
          </div>
          <div id="field-budget">
            <label className="text-[11px] font-semibold text-ink-muted">תקציב (חובה)</label>
            <input
              value={activeForm.budgetNumber || ""}
              onChange={(e) => updateFormDetails(activeFormId, { budgetNumber: e.target.value })}
              inputMode="numeric"
              placeholder="100-9999"
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
              disabled={!canEdit}
            />
          </div>
          <div id="field-topScorer">
            <label className="text-[11px] font-semibold text-ink-muted">מלך שערים</label>
            <PlayerAutocomplete
              value={activeForm.topScorer || ""}
              onChange={(val) => saveBonusPrediction(activeFormId, "topScorer", val)}
              disabled={!canEdit}
            />
          </div>
        </div>
        {championName && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-center text-xs text-yellow-700 font-semibold">
            🏆 אלופה: {championName}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-gray-400 font-medium truncate">
          {activeForm.formName} ›{" "}
          {selectedStage === "group"
            ? `שלב בתים › בית ${selectedGroup}`
            : getStageLabel(selectedStage)}
        </div>
        <button
          onClick={() => setShowSearch(true)}
          className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-primary/20 transition"
        >
          🔍 חפש
        </button>
      </div>

      {(
        <>
          <div className="sticky top-[56px] z-20 bg-bg pt-1 pb-2 -mx-4 px-4 md:mx-0 md:px-0">
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
            <div className="mb-4 space-y-2 md:max-w-md md:mx-auto">
              <button
                onClick={handleAIFill}
                disabled={!!aiProgress}
                title="ממלא את כל הניחושים בעזרת בינה מלאכותית"
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold py-3 rounded-2xl shadow-sm hover:from-blue-600 hover:to-purple-600 transition text-sm border-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                🤖 מלא הכל עם AI
              </button>
              <button
                onClick={handleTrySubmit}
                className="w-full bg-green-500 text-white font-bold py-3.5 rounded-2xl shadow-lg hover:bg-green-600 transition text-base border-none cursor-pointer"
              >
                הגש טופס
              </button>
            </div>
          )}

          {selectedStage === "group" && (
            <GroupTable matchData={matchPredictions} group={selectedGroup} />
          )}

          <div className="space-y-2">
            {filteredMatches.map((match, idx) => (
                <div
                  key={match.id}
                  id={`match-${match.id}`}
                  className={`scroll-mt-[220px] rounded-2xl ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
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
              <div className="text-center py-8 text-gray-400">
                <p>אין משחקים בשלב הזה</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "details" && (
        <FormDetailsTab
          activeForm={activeForm}
          activeFormId={activeFormId}
          canEdit={canEdit}
          championName={championName}
        />
      )}

      {showSearch && (
        <MatchSearch
          groupMatches={groupMatches}
          knockoutMatches={knockoutMatches}
          matchPredictions={matchPredictions}
          bracketTeams={bracketTeams}
          onJump={handleMatchJump}
          onClose={() => setShowSearch(false)}
        />
      )}

      <AIFillOverlay aiProgress={aiProgress} />


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
            setShowConfirm(false);
            setValidationErrors([]);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
