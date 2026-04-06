import { useState, useRef, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import ScoringTable from "./ScoringTable";
import MenuOverlay from "./MenuOverlay";
import {
  Home,
  ClipboardList,
  Trophy,
  CircleDot,
  BarChart3,
  Settings,
  Info,
  Menu,
  X,
  MoreHorizontal,
} from "lucide-react";

const NAV_ICONS = {
  home: Home,
  predict: ClipboardList,
  leaderboard: Trophy,
  results: CircleDot,
  stats: BarChart3,
  admin: Settings,
};

function InfoDropdown({ open, onToggle }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-transparent border-none cursor-pointer transition-all text-white/60 hover:text-white hover:bg-white/10"
      >
        <Info size={14} />
        מידע
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-border z-50 overflow-hidden animate-fade-in">
          {[
            { label: "📊 שיטת הניקוד", section: "scoring" },
            { label: "📜 החוקים", section: "rules" },
            { label: "ℹ️ אודות", section: "about" },
            { label: "🛠 תמיכה טכנית", section: "support" },
          ].map((item) => (
            <button
              key={item.section}
              onClick={() => {
                onToggle();
                document.dispatchEvent(
                  new CustomEvent("open-info-drawer", {
                    detail: item.section,
                  }),
                );
              }}
              className="w-full text-right px-4 py-3 text-sm text-ink hover:bg-gray-50 bg-transparent border-none cursor-pointer transition-colors border-b border-gray-50 last:border-b-0"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BottomMoreSheet({ open, onClose, navigate, page, isAdmin }) {
  if (!open) return null;
  const items = [{ id: "stats", label: "סטטיסטיקות", icon: BarChart3 }];
  if (isAdmin) {
    items.push({ id: "admin", label: "ניהול", icon: Settings });
  }
  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-[55] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[56] bg-white rounded-t-2xl shadow-2xl safe-area-bottom animate-fade-in">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-4 pb-4 space-y-1">
          {items.map(({ id, label, icon: ItemIcon }) => (
            <button
              key={id}
              onClick={() => {
                navigate(id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-transparent border-none cursor-pointer transition-colors ${
                page === id
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-ink hover:bg-gray-50"
              }`}
            >
              <ItemIcon size={20} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useCurrentUser();
  const { page, navigate } = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setMenuOpen(true);
    };
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

  const mobileNavItems = user
    ? allNavItems.filter((item) => item.id !== "stats" && item.id !== "admin")
    : allNavItems;

  return (
    <div className="bg-bg">
      <header className="header-gradient text-white sticky top-0 z-50 shadow-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white/90 bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-white md:hidden"
              aria-label="תפריט"
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
              >
                {item.label}
              </button>
            ))}
            <InfoDropdown
              open={infoOpen}
              onToggle={() => setInfoOpen(!infoOpen)}
            />
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

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border/50 z-50 safe-area-bottom md:hidden">
        <div className="max-w-lg mx-auto flex">
          {mobileNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex-1 flex flex-col items-center min-h-[48px] justify-center text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 ${
                  page === item.id ? "text-primary font-bold" : "text-ink-muted"
                }`}
              >
                <span className={`text-xl mb-0.5 transition-transform duration-150 ${page === item.id ? "scale-110" : ""}`}>
                  {item.emoji}
                </span>
                {item.label}
              </button>
            ))}
          {user && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center min-h-[48px] justify-center text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 ${
                page === "stats" || page === "admin"
                  ? "text-primary font-bold"
                  : "text-ink-muted"
              }`}
            >
              <MoreHorizontal
                size={22}
                strokeWidth={page === "stats" || page === "admin" ? 2.5 : 1.5}
                className="mb-0.5"
              />
              עוד
            </button>
          )}
        </div>
      </nav>

      <BottomMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        navigate={navigate}
        page={page}
        isAdmin={user?.isAdmin}
      />
    </div>
  );
}
