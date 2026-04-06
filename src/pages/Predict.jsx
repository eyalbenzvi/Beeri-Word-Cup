import { useState, useCallback, useMemo, useEffect } from "react";
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
  saveBonusPrediction,
  submitPredictions,
  reopenForm,
  setActiveFormId,
} from "../store";
import { groupMatches, knockoutMatches } from "../data/matches";
import { GROUPS } from "../data/teams";
import { calcBracketTeams } from "../utils/bracket";
import { randomScore, normalizeStatus } from "../utils/helpers";
import MatchCard from "../components/MatchCard";
import GroupTable from "../components/GroupTable";
import GroupSelector from "../components/GroupSelector";
import StageSelector from "../components/StageSelector";
import FormList from "../components/FormList";
import FormDetailsTab from "../components/FormDetailsTab";
import AllFormsView from "./AllForms";
import { useToast } from "../components/Toast";
import SaveIndicator from "../components/SaveIndicator";
import ReviewScreen from "../components/ReviewScreen";
import MatchSearch from "../components/MatchSearch";

const knockoutStageOrder = ["R32", "R16", "QF", "SF", "3RD", "F"];

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
    () => calcBracketTeams(matchPredictions),
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

    const bracket = calcBracketTeams(preds);
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
          action: () => setActiveTab("details"),
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

  const handleRandomize = useCallback(() => {
    if (!activeFormId || !canEdit) return;
    if (!window.confirm("פעולה זו תדרוס את כל הניחושים הקיימים בהגרלה אקראית. להמשיך?")) return;

    const allPreds = {};

    groupMatches.forEach((match) => {
      const pred = { homeScore: randomScore(), awayScore: randomScore() };
      allPreds[match.id] = pred;
      savePrediction(activeFormId, match.id, pred);
    });

    knockoutMatches.forEach((match) => {
      const pred = { homeScore: randomScore(), awayScore: randomScore() };
      allPreds[match.id] = pred;
      savePrediction(activeFormId, match.id, pred);
    });

    for (const stage of knockoutStageOrder) {
      const bracket = calcBracketTeams(allPreds);
      for (const match of knockoutMatches.filter((m) => m.stage === stage)) {
        const pred = allPreds[match.id];
        if (pred.homeScore === pred.awayScore) {
          const teams = bracket[match.id];
          if (teams?.home && teams?.away) {
            pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
            savePrediction(activeFormId, match.id, pred);
          }
        }
      }
    }

    const topScorers = [
      "Mbappé",
      "Haaland",
      "Vinicius Jr",
      "Messi",
      "Kane",
      "Salah",
      "Lewandowski",
      "Rashford",
      "Morata",
      "Lautaro Martínez",
      "Osimhen",
      "Álvarez",
      "Isak",
      "Saka",
      "Yamal",
      "Gyökeres",
      "Son",
      "Retegui",
      "Pulisic",
      "David",
    ];
    saveBonusPrediction(
      activeFormId,
      "topScorer",
      topScorers[Math.floor(Math.random() * topScorers.length)],
    );
    showToast("כל הניחושים הוגרלו! 🎲");
  }, [activeFormId, canEdit, showToast]);

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
    return <AllFormsView onBack={() => setShowAllForms(false)} />;
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

  const filteredMatches =
    selectedStage === "group"
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

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
          { id: "matches", label: "⚽ משחקים" },
          { id: "details", label: "📝 פרטים" },
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
            {tab.label}
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

      {status === "draft" && !settings.predictionsLocked && (
        <div className="sticky bottom-16 md:bottom-4 mt-6 pb-2 space-y-2 md:max-w-md md:mx-auto">
          <button
            onClick={handleRandomize}
            className="w-full bg-white text-primary font-bold py-3 rounded-2xl border-2 border-primary/20 shadow-sm hover:bg-gray-50 transition text-sm border-none cursor-pointer"
          >
            🎲 הגרלת כל הניחושים
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
