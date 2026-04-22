import { useState, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import MenuOverlay from "./MenuOverlay";
import { Menu } from "lucide-react";

export default function Layout({ children }) {
  const { user } = useCurrentUser();
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
      <header className="header-duo sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Hamburger — always visible */}
            <button
              onClick={() => setMenuOpen(true)}
              className="text-ink-muted bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-ink rounded-lg hover:bg-bg-soft"
              aria-label="תפריט"
              aria-expanded={menuOpen}
              aria-controls="menu-overlay"
            >
              <Menu size={24} />
            </button>
            <button
              onClick={() => navigate("home")}
              className="text-lg font-extrabold text-ink flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 tracking-tight"
            >
              <img
                src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png"
                alt="בארי"
                className="h-9 w-auto object-contain"
              />
              <span className="hidden sm:inline">בארי מונדיאל</span>
            </button>
          </div>

          {/* Desktop nav — pages only, no "מידע" tab */}
          <div className="hidden md:flex items-center gap-1">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`px-3 py-1.5 rounded-xl text-sm font-bold bg-transparent border-none cursor-pointer transition-colors whitespace-nowrap ${
                  page === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                }`}
                aria-current={page === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </div>

          {user ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate("profile")}
                className="bg-transparent border-none cursor-pointer p-0 flex items-center gap-2"
                aria-label="פרופיל"
              >
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-extrabold text-white border-2 border-primary-dark">
                  {(user.firstName || user.displayName || "?").charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold hidden lg:inline text-ink max-w-[80px] truncate">
                  {user.displayName || "משתמש"}
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("login")}
              className="btn-duo btn-duo-primary"
              style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
            >
              התחבר
            </button>
          )}
        </div>
      </header>

      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="max-w-3xl mx-auto w-full px-4 md:px-6 pt-3 md:pt-6 pb-24 md:pb-8">
        {children}
      </main>

      {/* Bottom nav — mobile, ALL items, no "עוד" */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border z-50 safe-area-bottom md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto flex">
          {allNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex-1 flex flex-col items-center min-h-[60px] justify-center gap-0.5 text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 pt-2 pb-1 ${
                page === item.id ? "text-primary font-extrabold" : "text-ink-muted font-semibold"
              }`}
              aria-current={page === item.id ? "page" : undefined}
            >
              <span className={`text-xl transition-transform duration-200 ${page === item.id ? "scale-125" : ""}`}>
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
