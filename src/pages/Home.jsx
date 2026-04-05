import { Link } from 'react-router-dom';
import { useCurrentUser, useSettings } from '../hooks/useStore';

export default function Home() {
  const { user } = useCurrentUser();
  const settings = useSettings();

  return (
    <div className="text-center">
      {/* Hero */}
      <div className="py-8">
        <div className="text-6xl mb-4">⚽🏆</div>
        <h1 className="text-2xl font-bold text-primary mb-2">
          טורניר הניחושים של בארי
        </h1>
        <p className="text-gray-600 mb-1">מונדיאל 2026</p>
        <p className="text-sm text-gray-400">
          ארה״ב • מקסיקו • קנדה
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${
            settings.predictionsLocked ? 'bg-red-400' : 'bg-green-400'
          } animate-pulse`} />
          <span className="text-sm font-medium text-gray-700">
            {settings.predictionsLocked
              ? 'הניחושים נעולים!'
              : 'הניחושים פתוחים'}
          </span>
        </div>

        {!user ? (
          <Link
            to="/login"
            className="block w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base no-underline"
          >
            הצטרף למשחק
          </Link>
        ) : (
          <div className="space-y-2">
            <Link
              to="/predict"
              className="block w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base no-underline"
            >
              📋 הטפסים שלי
            </Link>
            <Link
              to="/leaderboard"
              className="block w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary hover:bg-gray-50 transition text-base no-underline"
            >
              🏆 טבלת דירוג
            </Link>
          </div>
        )}
      </div>

      {/* Scoring Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-right">
        <h2 className="text-base font-bold text-primary mb-3">שיטת הניקוד</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th className="text-right py-1.5">שלב</th>
              <th className="text-center py-1.5">הכרעה</th>
              <th className="text-center py-1.5">+מדויק</th>
              <th className="text-center py-1.5">עליה</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr className="border-b border-gray-50">
              <td className="py-1.5">בתים</td>
              <td className="text-center font-semibold">1</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center font-semibold text-purple-600">2</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">שלב ה-32</td>
              <td className="text-center font-semibold">3</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center font-semibold text-purple-600">4</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">רבע גמר</td>
              <td className="text-center font-semibold">5</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center font-semibold text-purple-600">6</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">חצי גמר</td>
              <td className="text-center font-semibold">7</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center font-semibold text-purple-600">8</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">מקום שלישי</td>
              <td className="text-center font-semibold">7</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center">-</td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-1.5">גמר</td>
              <td className="text-center font-semibold">9</td>
              <td className="text-center font-semibold text-green-600">+3</td>
              <td className="text-center">-</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>🏆 ניחוש אלופה</span>
            <span className="font-bold text-yellow-600">9 נק׳</span>
          </div>
          <div className="flex justify-between">
            <span>⚽ מלך שערים</span>
            <span className="font-bold text-yellow-600">8 נק׳</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ניקוד הנוקאאוט מבוסס על תוצאת 90 דקות. שערי פנדלים בפנדלטים לא נספרים למלך השערים.
        </p>
      </div>
    </div>
  );
}
