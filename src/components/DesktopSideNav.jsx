// Persistent right sidebar navigation for xl: and up.
// Replaces the hamburger + top-tabs combo on desktop widths.
import { Home as HomeIcon, ClipboardList, Trophy, Goal, BarChart3, Settings, Info } from "lucide-react";

const ICON_MAP = {
  home: HomeIcon,
  predict: ClipboardList,
  leaderboard: Trophy,
  results: Goal,
  stats: BarChart3,
  admin: Settings,
};

export default function DesktopSideNav({ items, currentPage, onNavigate, user }) {
  const openInfo = () => {
    document.dispatchEvent(new CustomEvent("open-info-drawer"));
  };

  return (
    <aside
      className="hidden xl:flex xl:flex-col xl:gap-1 xl:sticky xl:top-6 xl:self-start xl:pt-2"
      aria-label="ניווט ראשי"
    >
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICON_MAP[item.id] || HomeIcon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer transition-colors text-right ${
                active
                  ? "bg-primary/10 text-primary font-extrabold"
                  : "bg-transparent text-ink-muted hover:text-ink hover:bg-bg-soft"
              }`}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 pt-4 border-t border-border flex flex-col gap-1">
        <button
          onClick={openInfo}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold border-none cursor-pointer transition-colors text-right bg-transparent text-ink-muted hover:text-ink hover:bg-bg-soft"
          aria-label="מידע וחוקים"
        >
          <Info size={20} strokeWidth={2} aria-hidden="true" />
          <span>מידע</span>
        </button>

        {user && (
          <button
            onClick={() => onNavigate("profile")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-none cursor-pointer bg-transparent text-right transition-colors ${
              currentPage === "profile" ? "bg-primary/10" : "hover:bg-bg-soft"
            }`}
            aria-label="פרופיל"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-extrabold text-white border-2 border-primary-dark flex-shrink-0">
              {(user.firstName || user.displayName || "?").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-bold text-ink truncate">
              {user.displayName || "משתמש"}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
