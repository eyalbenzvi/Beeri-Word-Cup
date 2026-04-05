import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useFullUserPredictions, useSettings } from '../hooks/useStore';
import { savePrediction, saveBonusPrediction, submitPredictions, updateUser } from '../store';
import { useUsers } from '../hooks/useStore';
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
  const predictions = useFullUserPredictions(user?.id);
  const settings = useSettings();
  const users = useUsers();
  const currentUserData = user ? users[user.id] : null;
  const [selectedStage, setSelectedStage] = useState('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [activeTab, setActiveTab] = useState('matches');
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  const status = predictions.status || 'draft';
  // User can edit only when status is 'draft' and predictions aren't globally locked
  const canEdit = status === 'draft' && !settings.predictionsLocked;

  const handlePredictionChange = useCallback(
    (matchId, prediction) => {
      if (!user || !canEdit) return;
      savePrediction(user.id, matchId, prediction);
    },
    [user, canEdit]
  );

  const handleSubmit = () => {
    if (!user) return;
    submitPredictions(user.id);
    setShowConfirm(false);
    setValidationErrors([]);
  };

  // Validate predictions before showing submit dialog
  const handleTrySubmit = () => {
    if (!user) return;
    const preds = predictions.matches || {};
    const errors = [];

    // Check group matches
    const missingGroup = groupMatches.filter(
      (m) => preds[m.id]?.homeScore === undefined || preds[m.id]?.homeScore === null ||
             preds[m.id]?.awayScore === undefined || preds[m.id]?.awayScore === null
    ).length;
    if (missingGroup > 0) {
      errors.push(`${missingGroup} משחקי בתים חסרים`);
    }

    // Check knockout matches
    const missingKnockout = knockoutMatches.filter(
      (m) => preds[m.id]?.homeScore === undefined || preds[m.id]?.homeScore === null ||
             preds[m.id]?.awayScore === undefined || preds[m.id]?.awayScore === null
    ).length;
    if (missingKnockout > 0) {
      errors.push(`${missingKnockout} משחקי נוקאאוט חסרים`);
    }

    // Check knockout ties have advancingTeam chosen
    const bracket = calcBracketTeams(preds);
    const unresolvedTies = knockoutMatches.filter((m) => {
      const pred = preds[m.id];
      if (!pred || pred.homeScore === null || pred.awayScore === null) return false;
      if (pred.homeScore !== pred.awayScore) return false;
      // It's a tie — check that advancingTeam is a valid team code
      const teams = bracket[m.id];
      return !pred.advancingTeam || (teams && pred.advancingTeam !== teams.home && pred.advancingTeam !== teams.away);
    }).length;
    if (unresolvedTies > 0) {
      errors.push(`${unresolvedTies} תיקו בנוקאאוט בלי בחירת מי עולה`);
    }

    // Check top scorer
    if (!predictions.topScorer?.trim()) {
      errors.push('לא הוכנס מלך שערים');
    }

    // Check form details
    if (!currentUserData?.formName?.trim()) {
      errors.push('לא הוכנס שם טופס');
    }
    if (!currentUserData?.budgetNumber?.trim()) {
      errors.push('לא הוכנס מספר תקציב');
    }

    setValidationErrors(errors);
    setShowConfirm(true);
  };

  const handleRandomize = () => {
    if (!user || !canEdit) return;

    const allPreds = {};

    // 1. Randomize group match scores
    groupMatches.forEach((match) => {
      const pred = { homeScore: randomScore(), awayScore: randomScore() };
      allPreds[match.id] = pred;
      savePrediction(user.id, match.id, pred);
    });

    // 2. Randomize knockout match scores (no advancingTeam yet)
    knockoutMatches.forEach((match) => {
      const pred = { homeScore: randomScore(), awayScore: randomScore() };
      allPreds[match.id] = pred;
      savePrediction(user.id, match.id, pred);
    });

    // 3. Resolve ties stage-by-stage using computed bracket
    for (const stage of knockoutStageOrder) {
      const bracket = calcBracketTeams(allPreds);
      for (const match of knockoutMatches.filter((m) => m.stage === stage)) {
        const pred = allPreds[match.id];
        if (pred.homeScore === pred.awayScore) {
          const teams = bracket[match.id];
          if (teams?.home && teams?.away) {
            pred.advancingTeam = Math.random() < 0.5 ? teams.home : teams.away;
            savePrediction(user.id, match.id, pred);
          }
        }
      }
    }

    // 4. Random top scorer
    const topScorers = [
      'Mbappé', 'Haaland', 'Vinicius Jr', 'Messi', 'Kane',
      'Salah', 'Lewandowski', 'Rashford', 'Morata', 'Lautaro Martínez',
      'Osimhen', 'Álvarez', 'Isak', 'Saka', 'Yamal',
      'Gyökeres', 'Son', 'Retegui', 'Pulisic', 'David',
    ];
    saveBonusPrediction(user.id, 'topScorer', topScorers[Math.floor(Math.random() * topScorers.length)]);
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

  const matchPredictions = predictions.matches || {};

  // Calculate knockout bracket teams from group stage predictions
  const bracketTeams = useMemo(() => calcBracketTeams(matchPredictions), [matchPredictions]);

  // Count progress
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

  // Status banner
  const renderStatusBanner = () => {
    if (status === 'pending') {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">⏳</div>
          <div className="text-sm font-semibold text-yellow-700">הוגש — ממתין לאישור מנהל</div>
          <div className="text-xs text-yellow-600 mt-1">
            הניחושים שלך נעולים עד שהמנהל יבדוק אותם.
          </div>
        </div>
      );
    }
    if (status === 'approved') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-2xl mb-1">✅</div>
          <div className="text-sm font-semibold text-green-700">אושר על ידי המנהל</div>
          <div className="text-xs text-green-600 mt-1">
            הניחושים שלך נעולים ויחושבו כאשר משחקים יתקיימו.
          </div>
        </div>
      );
    }
    if (predictions.rejectedAt) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-center">
          <div className="text-xs text-red-600">
            ההגשה הקודמת הוחזרה על ידי המנהל. אנא בדוק ושלח מחדש.
          </div>
        </div>
      );
    }
    return null;
  };

  // Submit confirmation dialog
  const renderConfirmDialog = () => {
    if (!showConfirm) return null;
    const hasErrors = validationErrors.length > 0;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <div className="text-3xl text-center mb-3">{hasErrors ? '⚠️' : '📋'}</div>
          <h3 className="text-lg font-bold text-center text-primary mb-2">
            {hasErrors ? 'לא ניתן להגיש עדיין' : 'להגיש ניחושים?'}
          </h3>
          {hasErrors ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <div className="text-sm font-semibold text-red-700 mb-1">אנא תקן את הבאים:</div>
              <ul className="text-xs text-red-600 space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>- {err}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 text-center mb-4">
                לאחר ההגשה לא תוכל לשנות עד שהמנהל יבדוק את הניחושים שלך.
              </p>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mb-4">
                <div>משחקים: {predictedGroupMatches + predictedKnockout} / {groupMatches.length + knockoutMatches.length}</div>
                <div>מלך שערים: {predictions.topScorer || 'לא הוכנס'}</div>
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
          // For knockout matches, override homeTeam/awayTeam with bracket-derived teams
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
        <input type="text" value={currentUserData?.formName || ''} disabled={!canEdit}
          onChange={(e) => updateUser(user.id, { formName: e.target.value })}
          placeholder="שם הטופס..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3 ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
        <input type="text" value={currentUserData?.budgetNumber || ''} disabled={!canEdit}
          onChange={(e) => updateUser(user.id, { budgetNumber: e.target.value })}
          placeholder="מספר תקציב לחיוב..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <h3 className="font-bold text-sm text-primary mb-1">⚽ מלך השערים (8 נק׳)</h3>
        <p className="text-xs text-gray-400 mb-3">מי יהיה מלך השערים? שערי פנדלים בפנדלטים לא נספרים.</p>
        <input type="text" value={predictions.topScorer || ''} disabled={!canEdit}
          onChange={(e) => saveBonusPrediction(user.id, 'topScorer', e.target.value)}
          placeholder="הכנס שם שחקן..."
          className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none ${!canEdit ? 'opacity-60 bg-gray-50' : ''}`} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-primary">הניחושים שלך</h1>
        {status === 'pending' && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">⏳ ממתין</span>
        )}
        {status === 'approved' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✅ אושר</span>
        )}
        {settings.predictionsLocked && status === 'draft' && (
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
            הגש ניחושים לאישור
          </button>
        </div>
      )}

      {renderConfirmDialog()}
    </div>
  );
}
