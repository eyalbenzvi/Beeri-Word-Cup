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
  submitPredictions,
  reopenForm,
  setActiveFormId,
} from "../store";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getCachedBracket } from "../utils/bracketCache";
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

const knockoutStageOrder = ["R32", "R16", "QF", "SF", "3RD", "F"];

const STAGE_LABELS = { R32: "שלב ה-32", R16: "שמינית גמר", QF: "רבע גמר", SF: "חצי גמר", "3RD": "מקום שלישי", F: "גמר" };
function getStageLabel(stage) { return STAGE_LABELS[stage] || stage; }

const AI_MESSAGES = [
  "⚽ סורק דירוגי FIFA...",
  "📊 מנתח סטטיסטיקות של נבחרות...",
  "🔍 בודק עימותים היסטוריים...",
  "🧠 מחשב הסתברויות...",
  "🌍 מעריך יתרון בית...",
  "💪 בודק פורם אחרון...",
  "🎯 מחפש הפתעות אפשריות...",
  "🏟️ מדמה תרחישי משחק...",
  "⭐ מזהה dark horses...",
  "🤔 מתלבט על תיקו פוטנציאלי...",
  "🔮 מנבא תוצאות...",
  "📝 מסכם ניתוח...",
];

function AiProgressMessage({ step }) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    setMsgIdx(Math.floor(Math.random() * AI_MESSAGES.length));
    const interval = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % AI_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [step]);
  return (
    <div className="text-xs text-ink-muted/70 animate-pulse h-5">
      {AI_MESSAGES[msgIdx]}
    </div>
  );
}

export default function Predict() {
  const { user } = useCurrentUser();
  const { navigate } = useNavigation();
  const showToast = useToast();
  const forms = useUserForms(user?.id);
  const activeFormId = useActiveFormId();
  const formData = useFormData(activeFormId);
  const settings = useSettings();
  const [selectedStage, setSelectedStage] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [activeTab, setActiveTab] = useState("matches");
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [showAllForms, setShowAllForms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const allPredictions = useAllPredictions();
  const aiAbortRef = useRef(null);
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

  const matchPredictions = activeForm?.matches || {};
  const bracketTeams = useMemo(
    () => getCachedBracket(matchPredictions),
    [matchPredictions],
  );

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!activeFormId || !canEdit) return;
      savePrediction(activeFormId, matchId, prediction);
    },
    [activeFormId, canEdit],
  );

  const handleSubmit = useCallback(() => {
    if (!activeFormId || submitting) return;
    setSubmitting(true);
    submitPredictions(activeFormId);
    setShowConfirm(false);
    setValidationErrors([]);
    showToast("הטופס הוגש בהצלחה! 🎉");
    setSubmitting(false);
  }, [activeFormId, submitting, showToast]);

  const handleTrySubmit = useCallback(() => {
    if (!activeFormId || !activeForm) return;
    const preds = activeForm.matches || {};
    const errors = [];

    const missingGroupMatches = groupMatches.filter(
      (m) =>
        preds[m.id]?.homeScore === undefined ||
        preds[m.id]?.homeScore === null ||
        preds[m.id]?.awayScore === undefined ||
        preds[m.id]?.awayScore === null,
    );
    if (missingGroupMatches.length > 0) {
      const firstMissing = missingGroupMatches[0];
      errors.push({
        label: `${missingGroupMatches.length} משחקי בתים חסרים`,
        action: () => {
          setSelectedStage("group");
          setSelectedGroup(firstMissing.group);
          setActiveTab("matches");
          setTimeout(() => {
            document
              .getElementById(`match-${firstMissing.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        },
      });
    }

    const missingKnockoutMatches = knockoutMatches.filter(
      (m) =>
        preds[m.id]?.homeScore === undefined ||
        preds[m.id]?.homeScore === null ||
        preds[m.id]?.awayScore === undefined ||
        preds[m.id]?.awayScore === null,
    );
    if (missingKnockoutMatches.length > 0) {
      const firstMissing = missingKnockoutMatches[0];
      errors.push({
        label: `${missingKnockoutMatches.length} משחקי נוקאאוט חסרים`,
        action: () => {
          setSelectedStage(firstMissing.stage);
          setActiveTab("matches");
          setTimeout(() => {
            document
              .getElementById(`match-${firstMissing.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        },
      });
    }

    const bracket = getCachedBracket(preds);
    const unresolvedTieMatches = knockoutMatches.filter((m) => {
      const pred = preds[m.id];
      if (!pred || pred.homeScore === null || pred.awayScore === null)
        return false;
      if (pred.homeScore !== pred.awayScore) return false;
      const teams = bracket[m.id];
      return (
        !pred.advancingTeam ||
        (teams &&
          pred.advancingTeam !== teams.home &&
          pred.advancingTeam !== teams.away)
      );
    });
    if (unresolvedTieMatches.length > 0) {
      const firstTie = unresolvedTieMatches[0];
      errors.push({
        label: `${unresolvedTieMatches.length} תיקו בנוקאאוט בלי בחירת מי עולה`,
        action: () => {
          setSelectedStage(firstTie.stage);
          setActiveTab("matches");
          setTimeout(() => {
            document
              .getElementById(`match-${firstTie.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        },
      });
    }

    if (!activeForm.topScorer?.trim()) {
      errors.push({
        label: "לא הוכנס מלך שערים",
        action: () => setActiveTab("details"),
      });
    }

    if (!activeForm.formName?.trim()) {
      errors.push({
        label: "לא הוכנס שם טופס",
        action: () => setActiveTab("details"),
      });
    } else {
      const trimmedName = activeForm.formName.trim().toLowerCase();
      const duplicateName = Object.entries(allPredictions).some(
        ([fid, f]) =>
          fid !== activeFormId &&
          f.formName?.trim().toLowerCase() === trimmedName &&
          (f.status === "submitted" ||
            f.status === "approved" ||
            f.status === "pending"),
      );
      if (duplicateName) {
        errors.push({
          label: "כבר קיים טופס שהוגש עם שם זהה. בחר שם אחר",
          action: () => {
            setActiveTab("details");
            setTimeout(() => document.querySelector('[name="formName"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
          },
        });
      }
    }
    if (!activeForm.budgetNumber?.trim()) {
      errors.push({
        label: "לא הוכנס מספר תקציב",
        action: () => setActiveTab("details"),
      });
    }

    setValidationErrors(errors);
    setShowConfirm(true);
  }, [activeFormId, activeForm, allPredictions]);

  const [aiProgress, setAiProgress] = useState(null); // null | { current, total, label }

  const callBatchAPI = async (body, signal) => {
    const res = await fetch("/.netlify/functions/batch-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "שגיאת API");
    return data;
  };

  // Generate a reasonable local score for small knockout rounds
  function localKnockoutScore() {
    const scores = [[1,0],[2,1],[0,1],[1,2],[2,0],[0,0],[1,1],[3,1],[1,0],[2,1],[0,1],[1,0]];
    const [h, a] = scores[Math.floor(Math.random() * scores.length)];
    return { homeScore: h, awayScore: a };
  }

  const handleAIFill = useCallback(async () => {
    if (!activeFormId || !canEdit) return;
    if (!window.confirm("כל הניחושים הקיימים יימחקו ויוחלפו בניחושי AI. להמשיך?")) return;

    const controller = new AbortController();
    aiAbortRef.current = controller;
    const formSnapshot = activeForm ? structuredClone(activeForm) : null;

    const allPreds = {};
    const totalSteps = 3;
    let currentStep = '';

    try {
      // Step 1: Group stage + Top scorer in PARALLEL (both independent)
      currentStep = 'שלב הבתים';
      setAiProgress({ current: 1, total: totalSteps, label: "שלב הבתים — 72 משחקים" });

      const groupMatchData = groupMatches.map((m) => ({
        id: m.id,
        homeTeamName: getTeamByCode(m.homeTeam)?.name || m.homeTeam,
        awayTeamName: getTeamByCode(m.awayTeam)?.name || m.awayTeam,
        stage: "group",
        group: m.group,
      }));

      // Fire both in parallel
      const [groupData, tsData] = await Promise.all([
        callBatchAPI({ matches: groupMatchData }, controller.signal),
        callBatchAPI({ type: "topScorer" }, controller.signal).catch(() => null),
      ]);

      const groupBatch = {};
      for (const r of groupData.results) {
        groupBatch[r.id] = { homeScore: r.homeScore, awayScore: r.awayScore };
        allPreds[r.id] = groupBatch[r.id];
      }
      savePredictionsBatch(activeFormId, groupBatch);

      // Step 2: R32 + R16 — 2 API calls (~4 sec)
      currentStep = 'שלב ה-32';
      setAiProgress({ current: 2, total: totalSteps, label: "שלב ה-32 — 16 משחקים" });

      let bracket = getCachedBracket(allPreds);
      const r32Data = knockoutMatches.filter((m) => m.stage === "R32")
        .filter((m) => bracket[m.id]?.home && bracket[m.id]?.away)
        .map((m) => ({
          id: m.id,
          homeTeamName: getTeamByCode(bracket[m.id].home)?.name || bracket[m.id].home,
          awayTeamName: getTeamByCode(bracket[m.id].away)?.name || bracket[m.id].away,
          stage: "R32",
        }));

      if (r32Data.length > 0) {
        const data = await callBatchAPI({ matches: r32Data }, controller.signal);
        const r32Batch = {};
        for (const r of data.results) {
          const pred = { homeScore: r.homeScore, awayScore: r.awayScore };
          if (pred.homeScore === pred.awayScore) {
            const teams = bracket[r.id];
            pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
          }
          r32Batch[r.id] = pred;
          allPreds[r.id] = pred;
        }
        savePredictionsBatch(activeFormId, r32Batch);
      }

      setAiProgress({ current: 2, total: totalSteps, label: "שמינית גמר — 8 משחקים" });

      bracket = getCachedBracket(allPreds);
      const r16Data = knockoutMatches.filter((m) => m.stage === "R16")
        .filter((m) => bracket[m.id]?.home && bracket[m.id]?.away)
        .map((m) => ({
          id: m.id,
          homeTeamName: getTeamByCode(bracket[m.id].home)?.name || bracket[m.id].home,
          awayTeamName: getTeamByCode(bracket[m.id].away)?.name || bracket[m.id].away,
          stage: "R16",
        }));

      if (r16Data.length > 0) {
        const data = await callBatchAPI({ matches: r16Data }, controller.signal);
        const r16Batch = {};
        for (const r of data.results) {
          const pred = { homeScore: r.homeScore, awayScore: r.awayScore };
          if (pred.homeScore === pred.awayScore) {
            const teams = bracket[r.id];
            pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
          }
          r16Batch[r.id] = pred;
          allPreds[r.id] = pred;
        }
        savePredictionsBatch(activeFormId, r16Batch);
      }

      // Step 3: QF + SF + 3RD + F — generated locally (instant)
      currentStep = 'רבע גמר עד הגמר';
      setAiProgress({ current: 3, total: totalSteps, label: "רבע גמר עד הגמר" });

      const localBatch = {};
      for (const stage of ["QF", "SF", "3RD", "F"]) {
        bracket = getCachedBracket(allPreds);
        const stageMatches = knockoutMatches.filter((m) => m.stage === stage);
        for (const m of stageMatches) {
          const teams = bracket[m.id];
          if (!teams?.home || !teams?.away) continue;
          const pred = localKnockoutScore();
          if (pred.homeScore === pred.awayScore) {
            pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
          }
          localBatch[m.id] = pred;
          allPreds[m.id] = pred;
        }
      }
      savePredictionsBatch(activeFormId, localBatch);

      // Top scorer — already fetched in parallel with groups
      if (tsData?.name) {
        saveBonusPrediction(activeFormId, "topScorer", tsData.name);
      }

      showToast("כל הניחושים מולאו בעזרת AI! 🤖✨");
    } catch (err) {
      if (formSnapshot && activeFormId) {
        // Restore all predictions from snapshot
        for (const [matchId, pred] of Object.entries(formSnapshot.matches || {})) {
          savePrediction(activeFormId, matchId, pred);
        }
        if (formSnapshot.topScorer) {
          saveBonusPrediction(activeFormId, "topScorer", formSnapshot.topScorer);
        }
      }
      if (err.name === 'AbortError') {
        showToast('מילוי AI בוטל');
      } else {
        showToast(`שגיאה ב${currentStep}: ${err.message}`);
      }
    } finally {
      setAiProgress(null);
    }
  }, [activeFormId, activeForm, canEdit, showToast]);

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
    }, 100);
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
  const predictedGroupMatches = groupMatches.filter(
    (m) =>
      matchPredictions[m.id]?.homeScore != null &&
      matchPredictions[m.id]?.awayScore != null,
  ).length;
  const predictedKnockout = knockoutMatches.filter(
    (m) =>
      matchPredictions[m.id]?.homeScore != null &&
      matchPredictions[m.id]?.awayScore != null,
  ).length;

  const filteredMatches = useMemo(() =>
    selectedStage === "group"
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage),
    [selectedStage, selectedGroup]
  );

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
              🔒 נעול
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

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {[
          { id: "matches", emoji: "⚽", label: "משחקים" },
          { id: "details", emoji: "📝", label: "פרטים" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition border-none cursor-pointer ${
              activeTab === tab.id
                ? "bg-white text-primary shadow-sm"
                : "text-gray-400"
            }`}
          >
            <span aria-hidden="true">{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "matches" && (
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] text-gray-400 font-medium truncate">
            {activeForm.formName} ›{" "}
            {selectedStage === "group"
              ? `שלב בתים › בית ${selectedGroup}`
              : (() => {
                  const stageNames = {
                    R32: "שלב ה-32",
                    R16: "שמינית גמר",
                    QF: "רבע גמר",
                    SF: "חצי גמר",
                    "3RD": "מקום שלישי",
                    F: "גמר",
                  };
                  return stageNames[selectedStage] || selectedStage;
                })()}
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-primary/20 transition"
          >
            🔍 חפש
          </button>
        </div>
      )}

      {activeTab === "matches" && (
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

          {selectedStage === "group" && (
            <GroupTable matchData={matchPredictions} group={selectedGroup} />
          )}

          <div className="space-y-2">
            {filteredMatches.map((match, idx) => {
              const derivedMatch =
                match.stage !== "group" && bracketTeams[match.id]
                  ? {
                      ...match,
                      homeTeam: bracketTeams[match.id].home,
                      awayTeam: bracketTeams[match.id].away,
                    }
                  : match;
              return (
                <div
                  key={match.id}
                  id={`match-${match.id}`}
                  className={`scroll-mt-[220px] rounded-2xl ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
                >
                  <MatchCard
                    match={derivedMatch}
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
                    onPredictionChange={(pred) =>
                      handlePredictionChange(match.id, pred)
                    }
                  />
                </div>
              );
            })}
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

      {aiProgress && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full text-center">
            <div className="text-5xl mb-4 animate-bounce">🤖</div>
            <div className="text-lg font-extrabold text-primary mb-4">
              הבינה המלאכותית מנתחת
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
                style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
              />
            </div>

            {/* Rotating fun messages */}
            <AiProgressMessage step={aiProgress.current} />

            <button
              onClick={() => aiAbortRef.current?.abort()}
              className="mt-3 text-xs text-ink-muted/70 underline cursor-pointer bg-transparent border-none"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {status === "draft" && !settings.predictionsLocked && (
        <div className={`sticky bottom-16 md:bottom-4 mt-6 pb-2 space-y-2 md:max-w-md md:mx-auto transition-all duration-200 ${keyboardOpen ? 'hidden' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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

      {showConfirm && (
        <ReviewScreen
          errors={validationErrors}
          activeForm={activeForm}
          groupMatchesCount={groupMatches.length}
          knockoutMatchesCount={knockoutMatches.length}
          predictedGroupCount={predictedGroupMatches}
          predictedKnockoutCount={predictedKnockout}
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
