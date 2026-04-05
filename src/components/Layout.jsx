import { useCurrentUser } from '../hooks/useStore';
import { useNavigation } from '../hooks/useNavigation';

export default function Layout({ children }) {
  const { user, logout } = useCurrentUser();
  const { page, navigate } = useNavigation();

  const navItems = [
    { id: 'home', label: 'בית', icon: '🏠' },
    { id: 'predict', label: 'טפסים', icon: '📋' },
    { id: 'leaderboard', label: 'דירוג', icon: '🏆' },
    { id: 'results', label: 'תוצאות', icon: '⚽' },
  ];

  if (user?.isAdmin) {
    navItems.push({ id: 'admin', label: 'ניהול', icon: '⚙️' });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('home')}
            className="text-lg font-bold text-white flex items-center gap-2 bg-transparent border-none cursor-pointer"
          >
            ⚽ בארי מונדיאל
          </button>
          {user ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm opacity-90 hidden sm:inline">
                {user.displayName}
              </span>
              <button
                onClick={logout}
                className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
              >
                החלף
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('login')}
              className="bg-white text-primary font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100 transition cursor-pointer border-none"
            >
              התחבר
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
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex-1 flex flex-col items-center py-2 text-xs bg-transparent border-none cursor-pointer transition-colors ${
                page === item.id
                  ? 'text-primary font-semibold'
                  : 'text-gray-500 hover:text-primary'
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
