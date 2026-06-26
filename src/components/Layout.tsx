import { useState, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
import MenuOverlay from "./MenuOverlay";
import DesktopSideNav from "./DesktopSideNav";
import ThemeToggle from "./ThemeToggle";
import OfflineBanner from "./OfflineBanner";
import { Menu, Home as HomeIcon, ClipboardList, Trophy, Goal, BarChart3, Settings, Newspaper } from "lucide-react";
import { BLOG } from "../constants/messages";

export default function Layout({ children, rightRail = null }) {
  const { user } = useCurrentUser();
  const { page, navigate } = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setMenuOpen(true);
    document.addEventListener("open-info-drawer", handler);
    return () => document.removeEventListener("open-info-drawer", handler);
  }, []);

  // Guests now see every primary tab — including the blog. The pages
  // themselves render guest fallbacks (LoginPrompt + empty-data states)
  // when an authenticated feature isn't accessible, and DailySummary has
  // its own pre-tournament empty state for logged-out visitors. The
  // motivation is that "tabs only when signed in" used to dead-end
  // first-time visitors on a single home page.
  const allNavItems = [
    { id: "home", label: "בית", Icon: HomeIcon },
    { id: "predict", label: "טפסים", Icon: ClipboardList },
    { id: "leaderboard", label: "דירוג", Icon: Trophy },
    { id: "results", label: "תוצאות", Icon: Goal },
    { id: "stats", label: "נתונים", Icon: BarChart3 },
    { id: "blog", label: BLOG.navLabel, Icon: Newspaper },
  ];
  if (user?.isAdmin) allNavItems.push({ id: "admin", label: "ניהול", Icon: Settings });

  return (
    // App shell: a fixed-height (100dvh) flex column. The header + bottom-nav
    // are flex children OUTSIDE the scroll container, so they are frozen on
    // every platform; only #app-scroll scrolls. Keeping the document itself
    // non-scrolling stops the mobile URL bar from collapsing mid-scroll, which
    // is what used to clip the header and hide the nav behind the gesture bar.
    // safe-area-top is on the shell (not the header) so the single top inset
    // is consumed once above whichever element is first — the OfflineBanner
    // when offline, otherwise the header — with no double padding.
    <div className="app-shell bg-bg safe-area-top">
      {/* Connectivity indicator — renders nothing while online. Part of the
          frozen top chrome so an offline user always sees it. */}
      <OfflineBanner />
      {/* Frozen header */}
      <header className="header-duo z-50 flex-shrink-0 safe-area-x">
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
                width="36"
                height="36"
                loading="eager"
                decoding="async"
                className="h-9 w-auto object-contain"
              />
              <span className="hidden sm:inline">בארי מונדיאל</span>
            </button>
          </div>

          {/* Tablet/mobile users navigate via the bottom-nav (xl:hidden); the
              previous header-tabs row was a duplicate that doubled the
              "active" indicator in landscape iPads. Desktop (xl+) uses
              DesktopSideNav. */}

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
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
              // Hide the header "התחבר" CTA on the home tab — the welcome
              // screen renders its own auth panel directly below the
              // header, so a second button right above it is redundant
              // and creates two competing primary CTAs in the same view.
              page !== "home" && (
                <button
                  onClick={() => navigate("home")}
                  className="btn-duo btn-duo-primary btn-duo-sm xl:hidden"
                >
                  התחבר
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* The single document-level scroll container. Everything below the
          frozen header and above the frozen bottom-nav scrolls here.
          - Mobile/tablet: single column capped at max-w-4xl
          - xl:  3-column grid (RTL: DesktopSideNav on right, content center, rightRail on left)
          Sticky offsets inside (DesktopSideNav, rail, page sub-bars) are now
          measured from THIS container's top (the header no longer occupies
          scroll space), so they use small top offsets rather than ~header-height. */}
      <div id="app-scroll" className="app-scroll">
        <div
          className={`mx-auto w-full px-4 md:px-6 pt-3 md:pt-6 pb-8 ${
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
            <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto" aria-label="פאנל הקשרי">
              {rightRail}
            </aside>
          )}
        </div>
      </div>

      {/* Frozen bottom nav — mobile/tablet only */}
      <nav className="bg-card border-t-2 border-border z-50 flex-shrink-0 safe-area-bottom safe-area-x xl:hidden">
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
