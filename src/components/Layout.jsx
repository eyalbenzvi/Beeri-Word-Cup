import { useState, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import MenuOverlay from "./MenuOverlay";
import { Menu } from "lucide-react";

export default function Layout({ children }) {
  const { user, logout } = useCurrentUser();
  const { page, navigate } = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMenuOpen(true);
    document.addEventListener("open-info-drawer", handler);
    return () => document.removeEventListener("open-info-drawer", handler);
  }, []);

  const allNavItems = user
    ? [
        { id: "home", label: "בית", emoji: "🏠" },
        { id: "predict", label: "טפסים", emoji: "📋" },
        { id: "leaderboard", label: "דירוג", emoji: "🏆" },
        { id: "results", label: "תוצאות", emoji: "⚽" },
        { id: "stats", label: "נתונים", emoji: "📊" },
      ]
    : [{ id: "home", label: "בית", emoji: "🏠" }];
  if (user?.isAdmin) allNavItems.push({ id: "admin", label: "ניהול", emoji: "⚙️" });

  return (
    <div className="bg-bg">
      {/* Header */}
      <header className="header-gradient text-white sticky top-0 z-50 shadow-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Hamburger — always visible */}
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white/90 bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-white"
              aria-label="תפריט"
              aria-expanded={menuOpen}
              aria-controls="menu-overlay"
            >
              <Menu size={22} />
            </button>
            <button
              onClick={() => navigate("home")}
              className="text-lg font-bold text-white flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 tracking-tight"
            >
              <img
                src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png"
                alt="בארי"
                className="h-9 w-auto object-contain"
              />
              בארי מונדיאל
            </button>
          </div>

          {/* Desktop nav — pages only, no "מידע" tab */}
          <div className="hidden md:flex items-center gap-0.5">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-transparent border-none cursor-pointer transition-all whitespace-nowrap ${
                  page === item.id
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
                aria-current={page === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </div>

          {user ? (
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold backdrop-blur-sm">
                {(user.displayName || "?").charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium hidden lg:inline text-white/90 max-w-[80px] truncate">
                {user.displayName || "משתמש"}
              </span>
              <button
                onClick={logout}
                className="text-xs bg-white/10 px-2.5 py-1 rounded-lg hover:bg-white/20 transition cursor-pointer border-none text-white/80 font-medium"
              >
                יציאה
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("login")}
              className="bg-white text-primary font-bold px-5 py-2 rounded-xl text-sm hover:bg-gray-50 transition cursor-pointer border-none shadow-sm"
            >
              התחבר
            </button>
          )}
        </div>
      </header>

      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="max-w-3xl mx-auto w-full px-4 md:px-6 pt-3 md:pt-6 pb-20 md:pb-8">
        {children}
      </main>

      {/* Bottom nav — mobile, ALL items, no "עוד" */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border/50 z-50 safe-area-bottom md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto flex">
          {allNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex-1 flex flex-col items-center min-h-[48px] justify-center text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 ${
                page === item.id ? "text-primary font-bold" : "text-ink-muted"
              }`}
              aria-current={page === item.id ? "page" : undefined}
            >
              <span className={`text-lg mb-0.5 transition-transform duration-150 ${page === item.id ? "scale-110" : ""}`}>
                {item.emoji}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
