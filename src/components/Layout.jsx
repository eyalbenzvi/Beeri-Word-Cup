import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout({ children }) {
  const { user, userProfile, login, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/predict', label: 'Predict', icon: '🎯' },
    { path: '/leaderboard', label: 'Scores', icon: '🏆' },
  ];

  if (userProfile?.isAdmin) {
    navItems.push({ path: '/admin', label: 'Admin', icon: '⚙️' });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold no-underline text-white flex items-center gap-2">
            ⚽ Beeri World Cup
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-90 hidden sm:inline">
                {userProfile?.displayName}
              </span>
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-7 h-7 rounded-full border-2 border-white/30"
                />
              )}
              <button
                onClick={logout}
                className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="bg-white text-primary font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="max-w-lg mx-auto flex">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 flex flex-col items-center py-2 text-xs no-underline transition-colors ${
                location.pathname === item.path
                  ? 'text-primary font-semibold'
                  : 'text-gray-500 hover:text-primary'
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
