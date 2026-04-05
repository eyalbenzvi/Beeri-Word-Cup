import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTournamentSettings } from '../hooks/useFirestore';

export default function Home() {
  const { user, login } = useAuth();
  const { settings } = useTournamentSettings();

  return (
    <div className="text-center">
      {/* Hero */}
      <div className="py-8">
        <div className="text-6xl mb-4">⚽🏆</div>
        <h1 className="text-2xl font-bold text-primary mb-2">
          Beeri World Cup 2026
        </h1>
        <p className="text-gray-600 mb-1">Prediction Game</p>
        <p className="text-sm text-gray-400">
          USA • Mexico • Canada
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
              ? 'Predictions are locked!'
              : 'Predictions are open'}
          </span>
        </div>

        {!user ? (
          <button
            onClick={login}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base"
          >
            Sign In to Play
          </button>
        ) : (
          <div className="space-y-2">
            <Link
              to="/predict"
              className="block w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base no-underline"
            >
              🎯 Make Predictions
            </Link>
            <Link
              to="/leaderboard"
              className="block w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary hover:bg-gray-50 transition text-base no-underline"
            >
              🏆 View Leaderboard
            </Link>
          </div>
        )}
      </div>

      {/* Scoring Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left">
        <h2 className="text-base font-bold text-primary mb-3">How Scoring Works</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-600">Exact Score</span>
            <span className="font-bold text-green-600">5-15 pts</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-600">Correct Goal Difference</span>
            <span className="font-bold text-blue-600">3-10 pts</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-600">Correct Outcome</span>
            <span className="font-bold text-yellow-600">2-6 pts</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-50">
            <span className="text-gray-600">Correct Advancing Team</span>
            <span className="font-bold text-purple-600">2-4 pts</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-600">Correct Champion</span>
            <span className="font-bold text-red-600">+10 pts</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Points increase in later rounds. Final match is worth up to 15 points!
        </p>
      </div>
    </div>
  );
}
