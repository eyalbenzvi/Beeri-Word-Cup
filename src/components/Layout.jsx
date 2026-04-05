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
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="bg-primary text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('home')}
            className="text-lg font-bold text-white flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 tracking-tight"
          >
            <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" className="w-7 h-7 rounded-full object-cover" />
            בארי מונדיאל
          </button>
          {user ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:inline">
                {user.displayName}
              </span>
              <button
                onClick={logout}
                className="text-xs bg-white/15 px-3 py-1.5 rounded-lg hover:bg-white/25 transition cursor-pointer border-none text-white/90 font-medium"
              >
                יציאה
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('login')}
              className="bg-white text-primary font-bold px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition cursor-pointer border-none shadow-sm"
            >
              התחבר
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-24">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <div className="max-w-lg mx-auto flex">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex-1 flex flex-col items-center pt-2 pb-2.5 text-[11px] bg-transparent border-none cursor-pointer transition-all duration-150 ${
                page === item.id
                  ? 'text-primary font-bold'
                  : 'text-gray-400'
              }`}
            >
              <span className={`text-xl mb-0.5 transition-transform duration-150 ${page === item.id ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
