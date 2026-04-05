import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useCurrentUser, useUserForms, useActiveFormId, useFormData, useSettings,
} from '../hooks/useStore';
import {
  savePrediction, saveBonusPrediction, submitPredictions, reopenForm,
  createForm, deleteForm, setActiveFormId, updateFormDetails,
} from '../store';
import { generateGroupMatches, generateKnockoutMatches } from '../data/matches';
import { GROUPS } from '../data/teams';
import { calcBracketTeams } from '../utils/bracket';
import MatchCard from '../components/MatchCard';
import GroupTable from '../components/GroupTable';
import GroupSelector from '../components/GroupSelector';
import StageSelector from '../components/StageSelector';

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();
const knockoutStageOrder = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];

// Random score generator - weighted toward realistic football scores
function randomScore() {
  const weights = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
  return weights[Math.floor(Math.random() * weights.length)];
}

export default function Predict() {
  const { user } = useCurrentUser();
  const forms = useUserForms(user?.id);
  const activeFormId = useActiveFormId();
  const formData = useFormData(activeFormId);
  const settings = useSettings();
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [activeTab, setActiveTab] = useState('matches');
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormName, setNewFormName] = useState('');

  // Make sure active form belongs to current user
  const activeForm = activeFormId && formData?.userId === user?.id ? formData : null;
  const status = activeForm?.status || 'draft';
  const canEdit = status === 'draft' && !settings.predictionsLocked;

  // Must call useMemo unconditionally (React hooks rules)
  const matchPredictions = activeForm?.matches || {};
  const bracketTeams = useMemo(() => calcBracketTeams(matchPredictions), [matchPredictions]);

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!activeFormId || !canEdit) return;
      savePrediction(activeFormId, matchId, prediction);
    },
    [activeFormId, canEdit]
  );

  const handleSubmit = () => {
    if (!activeFormId) return;
    submitPredictions(activeFormId);
    setShowConfirm(false);
    setValidationErrors([]);
  };

  const handleTrySubmit = () => {
    if (!activeFormId || !activeForm) return;
    const preds = activeForm.matches || {};
    const errors = [];

    const missingGroup = groupMatches.filter(
      (m) => preds[m.id]?.homeScore === undefined || preds[m.id]?.homeScore === null ||
             preds[m.id]?.awayScore === undefined || preds[m.id]?.awayScore === null
    ).length;
    if (missingGroup > 0) {
      errors.push(`${missingGroup} משחקי בתים חסרים`);
    }

    const missingKnockout = knockoutMatches.filter(
      (m) => preds[m.id]?.homeScore === undefined || preds[m.id]?.homeScore === null ||
             preds[m.id]?.awayScore === undefined || preds[m.id]?.awayScore === null
    ).length;
    if (missingKnockout > 0) {
      errors.push(`${missingKnockout} משחקי נוקאאוט חסרים`);
    }

    const bracket = calcBracketTeams(preds);
    const unresolvedTies = knockoutMatches.filter((m) => {
      const pred = preds[m.id];
      if (!pred || pred.homeScore === null || pred.awayScore === null) return false;
      if (pred.homeScore !== pred.awayScore) return false;
      const teams = bracket[m.id];
      return !pred.advancingTeam || (teams && pred.advancingTeam !== teams.home && pred.advancingTeam !== teams.away);
    }).length;
    if (unresolvedTies > 0) {
      errors.push(`${unresolvedTies} תיקו בנוקאאוט בלי בחירת מי עולה`);
    }

    if (!activeForm.topScorer?.trim()) {
      errors.push('לא הוכנס מלך שערים');
    }

    if (!activeForm.formName?.trim()) {
      errors.push('לא הוכנס שם טופס');
    }
    if (!activeForm.budgetNumber?.trim()) {
      errors.push('לא הוכנס מספר תקציב');
    }

    setValidationErrors(errors);
    setShowConfirm(true);
  };

  const handleRandomize = () => {
    if (!activeFormId || !canEdit) return;

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
      'Mbappé', 'Haaland', 'Vinicius Jr', 'Messi', 'Kane',
      'Salah', 'Lewandowski', 'Rashford', 'Morata', 'Lautaro Martínez',
      'Osimhen', 'Álvarez', 'Isak', 'Saka', 'Yamal',
      'Gyökeres', 'Son', 'Retegui', 'Pulisic', 'David',
    ];
    saveBonusPrediction(activeFormId, 'topScorer', topScorers[Math.floor(Math.random() * topScorers.length)]);
  };

  const handleCreateForm = () => {
    if (!user) return;
    const name = newFormName.trim() || `טופס ${forms.length + 1}`;
    createForm(user.id, name);
    setNewFormName('');
    setShowNewForm(false);
  };

  const handleDeleteForm = (formId) => {
    deleteForm(formId);
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-gray-700 mb-2">הצטרף למשחק קודם</h2>
        <p className="text-gray-500 mb-4">צריך לבחור שם כדי למלא ניחושים</p>
        <Link to="/login" className="inline-block bg-primary text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-light transition no-underline">
          הצטרף למשחק
        </Link>
      </div>
    );
  }

  // === FORM LIST VIEW (no active form or choosing form) ===
  if (!activeForm) {
    return (
      <div>
        <h1 className="text-xl font-bold text-primary mb-4">הניחושים שלך</h1>

        {forms.length === 0 && !showNewForm && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-gray-500 mb-4">עדיין לא יצרת טפסים</p>
          </div>
        )}

        {/* Existing forms */}
        <div className="space-y-2 mb-4">
          {forms.map((form) => (
            <div key={form.formId} className={`bg-white rounded-xl p-4 border ${
              form.status === 'submitted' ? 'border-green-200 bg-green-50/30' :
              'border-gray-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{form.formName || 'טופס ללא שם'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {Object.keys(form.matches || {}).length} משחקים מלאו
                    {form.budgetNumber ? ` • תקציב: ${form.budgetNumber}` : ''}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  form.status === 'submitted' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {form.status === 'submitted' ? '✅ הוגש' : 'טיוטה'}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setActiveFormId(form.formId)}
                  className="flex-1 bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-light transition"
                >
                  {form.status === 'draft' ? 'ערוך' : 'צפה'}
                </button>
                {form.status === 'submitted' && !settings.predictionsLocked && (
                  <button
                    onClick={() => reopenForm(form.formId)}
                    className="px-3 py-2 bg-yellow-50 text-yellow-700 text-sm rounded-lg hover:bg-yellow-100 transition"
                  >
                    פתח לעריכה
                  </button>
                )}
                {form.status === 'draft' && (
                  <button
                    onClick={() => {
                      if (window.confirm(`למחוק את "${form.formName}"?`)) handleDeleteForm(form.formId);
                    }}
                    className="px-3 py-2 bg-red-50 text-red-500 text-sm rounded-lg hover:bg-red-100 transition"
                  >
                    מחק
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* New form */}
        {showNewForm ? (
          <div className="bg-white rounded-xl p-4 border border-primary">
            <h3 className="font-semibold text-sm text-primary mb-3">טופס חדש</h3>
            <input
              type="text"
              value={newFormName}
              onChange={(e) => setNewFormName(e.target.value)}
              placeholder={`טופס ${forms.length + 1}`}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleCreateForm}
                className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-xl hover:bg-primary-light transition text-sm">
                צור טופס
              </button>
              <button onClick={() => { setShowNewForm(false); setNewFormName(''); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base"
          >
            + טופס חדש
          </button>
        )}
      </div>
    );
  }

  // === FORM EDITING VIEW ===
  const predictedGroupMatches = groupMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;
  const predictedKnockout = knockoutMatches.filter(
    (m) => matchPredictions[m.id]?.homeScore !== undefined && matchPredictions[m.id]?.homeScore !== null
  ).length;

  const filteredMatches =
    selectedStage === 'group'
      ? groupMatches.filter((m) => m.group === selectedGroup)
      : knockoutMatches.filter((m) => m.stage === selectedStage);

  const renderStatusBanner = () => {
    if (status === 'submitted') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-semibold text-green-700">הטופס הוגש</div>
          <div className="text-xs text-green-600 mt-1">הניחושים נעולים ויחושבו כאשר משחקים יתקיימו.</div>
          {!settings.predictionsLocked && (
            <button
              onClick={() => reopenForm(activeFormId)}
              className="mt-2 text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-200 transition"
            >
              פתח לעריכה
            </button>
          )}
        </div>
      );
    }
    return null;
  };

  const renderConfirmDialog = () => {
    if (!showConfirm) return null;
    const hasErrors = validationErrors.length > 0;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <div className="text-3xl text-center mb-3">{hasErrors ? '⚠️' : '📋'}</div>
          <h3 className="text-lg font-bold text-center text-primary mb-2">
            {hasErrors ? 'הטופס לא מלא' : 'להגיש את הטופס?'}
          </h3>
          {hasErrors ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <div className="text-sm font-semibold text-red-700 mb-1">יש להשלים את הבאים:</div>
              <ul className="text-xs text-red-600 space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>- {err}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 text-center mb-4">
                לאחר ההגשה הטופס יינעל. תוכל לפתוח אותו לעריכה בכל עת.
              </p>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mb-4">
                <div>טופס: {activeForm.formName}</div>
                <div>משחקים: {predictedGroupMatches + predictedKnockout} / {groupMatches.length + knockoutMatches.length}</div>
                <div>מלך שערים: {activeForm.topScorer || 'לא הוכנס'}</div>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowConfirm(false); setValidationErrors([]); }}
              className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition"
            >
              {hasErrors ? 'חזרה' : 'ביטול'}
            </button>
            {!hasErrors && (
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-light transition"
              >
                הגש
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMatchesTab = () => (
    <>
      <StageSelector selectedStage={selectedStage} onSelect={setSelectedStage} />
      {selectedStage === 'group' && (
        <GroupSelector groups={Object.keys(GROUPS)} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
      )}
      {selectedStage === 'group' && (
        <GroupTable matchData={matchPredictions} group={selectedGroup} />
      )}
      <div className="space-y-2">
        {filteredMatches.map((match) => {
          const derivedMatch = match.stage !== 'group' && bracketTeams[match.id]
            ? { ...match, homeTeam: bracketTeams[match.id].home, awayTeam: bracketTeams[match.id].away }
            : match;
          return (
            <MatchCard
              key={match.id}
              match={derivedMatch}
              prediction={matchPredictions[match.id]}
              editable={canEdit}
              isKnockout={match.stage !== 'group'}
              onPredictionChange={(pred) => handlePredictionChange(match.id, pred)}
            />
          );
        })}
        {filteredMatches.length === 0 && (
          <div className="text-center py-8 text-gray-400"><p>אין משחקים בשלב הזה</p></div>
        )}
      </div>
    </>
  );

  const renderDetailsTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">📝 פרטי הטופס</h3>
        <p className="text-xs text-gray-400 mb-3">שם הטופס הוא מה שיוצג בטבלת התוצאות</p>
        <input type="text" value={activeForm.formName || ''} disabled={!canEdit}
          onChange={(e) => updateFormDetails(activeFormId, { formName: e.target.value })}
          placeholder="שם הטופס..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3 ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
        <input type="text" value={activeForm.budgetNumber || ''} disabled={!canEdit}
          onChange={(e) => updateFormDetails(activeFormId, { budgetNumber: e.target.value })}
          placeholder="מספר תקציב לחיוב..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">⚽ מלך השערים (8 נק׳)</h3>
        <p className="text-xs text-gray-400 mb-3">מי יהיה מלך השערים? שערי פנדלים בפנדלטים לא נספרים.</p>
        <input type="text" value={activeForm.topScorer || ''} disabled={!canEdit}
          onChange={(e) => saveBonusPrediction(activeFormId, 'topScorer', e.target.value)}
          placeholder="הכנס שם שחקן..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
      </div>
    </div>
  );

  return (
    <div>
      {/* Header with back button and form name */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveFormId(null)}
            className="text-sm text-primary font-medium">
            הטפסים שלי →
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-bold text-primary truncate">{activeForm.formName}</h1>
        </div>
        {status === 'submitted' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✅ הוגש</span>
        )}
        {settings.predictionsLocked && (
          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">🔒 נעול</span>
        )}
      </div>

      {renderStatusBanner()}

      {/* Progress */}
      <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>בתים: {predictedGroupMatches}/{groupMatches.length}</span>
          <span>נוקאאוט: {predictedKnockout}/{knockoutMatches.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${((predictedGroupMatches + predictedKnockout) / (groupMatches.length + knockoutMatches.length)) * 100}%` }} />
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { id: 'matches', label: 'משחקים' },
          { id: 'details', label: 'פרטים' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'matches' && renderMatchesTab()}
      {activeTab === 'details' && renderDetailsTab()}

      {/* Action Buttons — only show when draft */}
      {status === 'draft' && !settings.predictionsLocked && (
        <div className="sticky bottom-16 mt-6 pb-2 space-y-2">
          <button
            onClick={handleRandomize}
            className="w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary shadow-sm hover:bg-gray-50 active:bg-gray-100 transition text-base"
          >
            🎲 הגרלת כל הניחושים
          </button>
          <button
            onClick={handleTrySubmit}
            className="w-full bg-green-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-green-600 active:bg-green-700 transition text-base"
          >
            הגש טופס
          </button>
        </div>
      )}

      {renderConfirmDialog()}
    </div>
  );
}
