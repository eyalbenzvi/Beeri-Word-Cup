import { useState } from 'react';
import { useCurrentUser, useSettings } from '../hooks/useStore';
import { useNavigation } from '../hooks/useNavigation';

export default function Home() {
  const { user } = useCurrentUser();
  const settings = useSettings();
  const { navigate } = useNavigation();
  const [showScoring, setShowScoring] = useState(false);

  return (
    <div className="text-center">
      {/* Hero */}
      <div className="py-6">
        <div className="text-5xl mb-3">⚽🏆</div>
        <h1 className="text-2xl font-extrabold text-primary mb-1.5 tracking-tight">
          טורניר הניחושים של בארי
        </h1>
        <p className="text-gray-500 text-sm font-medium">מונדיאל 2026</p>
        <p className="text-xs text-gray-400 mt-1">
          ארה״ב • מקסיקו • קנדה
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-3">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className={`w-2 h-2 rounded-full ${
            settings.predictionsLocked ? 'bg-red-400' : 'bg-green-400'
          } animate-pulse`} />
          <span className="text-sm font-semibold text-gray-600">
            {settings.predictionsLocked
              ? 'הגשת טפסים נעולה'
              : 'הגשת טפסים פתוחה'}
          </span>
        </div>

        {!user ? (
          <button
            onClick={() => navigate('login')}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-sm"
          >
            התחבר למשחק
          </button>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={() => navigate('predict')}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-sm"
            >
              📋 הטפסים שלי
            </button>
            <button
              onClick={() => navigate('leaderboard')}
              className="w-full bg-white text-primary font-bold py-3.5 rounded-2xl border-2 border-primary/20 hover:border-primary/40 hover:bg-gray-50 transition text-base cursor-pointer"
            >
              🏆 טבלת דירוג
            </button>
          </div>
        )}
      </div>

      {/* Scoring Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-right">
        <button
          onClick={() => setShowScoring(!showScoring)}
          className="w-full flex items-center justify-between text-sm font-bold text-primary bg-transparent border-none cursor-pointer p-0"
        >
          <span className="text-gray-400 text-xs">{showScoring ? '▲' : '▼'}</span>
          <span>📊 שיטת הניקוד</span>
        </button>
        {showScoring && (
          <div className="mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b-2 border-gray-100">
                  <th className="text-right py-2 font-semibold">שלב</th>
                  <th className="text-center py-2 font-semibold">הכרעה</th>
                  <th className="text-center py-2 font-semibold">+מדויק</th>
                  <th className="text-center py-2 font-semibold">עליה</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ['בתים', 1, 3, 2],
                  ['שלב ה-32', 3, 3, 4],
                  ['רבע גמר', 5, 3, 6],
                  ['חצי גמר', 7, 3, 8],
                  ['מקום שלישי', 7, 3, null],
                  ['גמר', 9, 3, null],
                ].map(([stage, outcome, exact, advance], i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{stage}</td>
                    <td className="text-center font-bold">{outcome}</td>
                    <td className="text-center font-bold text-green-600">+{exact}</td>
                    <td className="text-center font-bold text-purple-600">{advance ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-gray-600">🏆 ניחוש אלופה</span>
                <span className="font-bold text-yellow-600">9 נק׳</span>
              </div>
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-gray-600">⚽ מלך שערים</span>
                <span className="font-bold text-yellow-600">8 נק׳</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              ניקוד הנוקאאוט מבוסס על תוצאת 90 דקות. שערי פנדלים בפנדלטים לא נספרים למלך השערים.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
