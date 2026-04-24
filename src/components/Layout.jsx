import { useState, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import MenuOverlay from "./MenuOverlay";
import DesktopSideNav from "./DesktopSideNav";
import { Menu, Home as HomeIcon, ClipboardList, Trophy, Goal, BarChart3, Settings } from "lucide-react";

export default function Layout({ children, rightRail = null }) {
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
        { id: "home", label: "בית", Icon: HomeIcon },
        { id: "predict", label: "טפסים", Icon: ClipboardList },
        { id: "leaderboard", label: "דירוג", Icon: Trophy },
        { id: "results", label: "תוצאות", Icon: Goal },
        { id: "stats", label: "נתונים", Icon: BarChart3 },
      ]
    : [{ id: "home", label: "בית", Icon: HomeIcon }];
  if (user?.isAdmin) allNavItems.push({ id: "admin", label: "ניהול", Icon: Settings });

  return (
    <div className="bg-bg">
      {/* Header */}
      <header className="header-duo sticky top-0 z-50">
        <div className="max-w-7xl xl:max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Hamburger — hidden on xl: (replaced by DesktopSideNav) */}
            <button
              onClick={() => setMenuOpen(true)}
              className="text-ink-muted bg-transparent border-none cursor-pointer p-1.5 leading-none hover:text-ink rounded-xl hover:bg-bg-soft xl:hidden"
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

          {/* Tablet nav — text tabs; hidden on xl: (replaced by DesktopSideNav) */}
          <div className="hidden md:flex xl:hidden items-center gap-1">
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
            <div className="flex items-center gap-1.5 xl:hidden">
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
              className="btn-duo btn-duo-primary btn-duo-sm xl:hidden"
            >
              התחבר
            </button>
          )}
        </div>
      </header>

      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* App shell:
          - Mobile/tablet: single column capped at max-w-4xl
          - xl:  3-column grid (RTL: DesktopSideNav on right, content center, rightRail on left) */}
      <div
        className={`mx-auto w-full px-4 md:px-6 pt-3 md:pt-6 pb-24 xl:pb-8 ${
          rightRail
            ? "max-w-4xl xl:max-w-[1400px] xl:grid xl:grid-cols-[220px_minmax(0,1fr)_320px] xl:gap-8"
            : "max-w-4xl xl:max-w-[1400px] xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-8"
        }`}
      >
        <DesktopSideNav items={allNavItems} currentPage={page} onNavigate={navigate} user={user} />
        <main className="min-w-0">
          {children}
        </main>
        {rightRail && (
          <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto" aria-label="פאנל הקשרי">
            {rightRail}
          </aside>
        )}
      </div>

      {/* Bottom nav — mobile/tablet only */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border z-50 safe-area-bottom xl:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto flex">
          {allNavItems.map((item) => {
            const { Icon } = item;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex-1 flex flex-col items-center min-h-[60px] justify-center gap-0.5 text-xs bg-transparent border-none cursor-pointer transition-colors duration-150 pt-2 pb-1 ${
                  active ? "text-primary font-extrabold" : "text-ink-muted font-bold"
                }`}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? "scale-110 transition-transform" : "transition-transform"} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
