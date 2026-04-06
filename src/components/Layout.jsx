import { useState, useRef, useEffect } from "react";
import { useCurrentUser } from "../hooks/useStore";
import { useNavigation } from "../hooks/useNavigation";
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

const SCORING_DATA = [
  ["בתים", 1, 3, 2],
  ["שלב ה-32", 3, 3, 4],
  ["שמינית גמר", 5, 3, 6],
  ["רבע גמר", 7, 3, 8],
  ["חצי גמר", 9, 3, 10],
  ["מקום שלישי", 9, 3, null],
  ["גמר", 11, 3, null],
];

const NAV_ICONS = {
  home: Home,
  predict: ClipboardList,
  leaderboard: Trophy,
  results: CircleDot,
  stats: BarChart3,
  admin: Settings,
};

function MenuSection({ icon, title, active, onToggle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
      >
        <span className="text-ink-muted text-xs">{active ? "▲" : "▼"}</span>
        <span className="text-sm font-bold text-primary">
          {icon} {title}
        </span>
      </button>
      {active && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function MenuOverlay({ open, onClose }) {
  const [activeSection, setActiveSection] = useState(null);
  if (!open) return null;
  const toggle = (id) => setActiveSection(activeSection === id ? null : id);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 h-full w-[85%] max-w-sm bg-bg z-[70] shadow-2xl overflow-y-auto animate-slide-in">
        <div className="header-gradient text-white p-5 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-white/80 bg-transparent border-none cursor-pointer p-0 leading-none"
          >
            <X size={24} />
          </button>
          <h2 className="text-lg font-extrabold tracking-tight">מידע</h2>
        </div>

        <div className="p-4 space-y-2">
          <MenuSection
            icon="📊"
            title="שיטת הניקוד"
            active={activeSection === "scoring"}
            onToggle={() => toggle("scoring")}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-muted border-b-2 border-border">
                  <th className="text-right py-2 font-semibold">שלב</th>
                  <th className="text-center py-2 font-semibold">הכרעה</th>
                  <th className="text-center py-2 font-semibold">+מדויק</th>
                  <th className="text-center py-2 font-semibold">עליה</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {SCORING_DATA.map(([stage, outcome, exact, advance], i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{stage}</td>
                    <td className="text-center font-bold">{outcome}</td>
                    <td className="text-center font-bold text-green-600">
                      +{exact}
                    </td>
                    <td className="text-center font-bold text-purple-600">
                      {advance ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-ink-muted">🏆 ניחוש אלופה</span>
                <span className="font-bold text-accent-text">9 נק׳</span>
              </div>
              <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                <span className="text-ink-muted">⚽ מלך שערים</span>
                <span className="font-bold text-accent-text">8 נק׳</span>
              </div>
            </div>
            <p className="text-[11px] text-ink-muted mt-3 leading-relaxed">
              ניקוד הנוקאאוט מבוסס על תוצאת 90 דקות. שערי פנדלים בבעיטות הכרעה
              לא נספרים למלך השערים.
            </p>
          </MenuSection>

          <MenuSection
            icon="📜"
            title="החוקים"
            active={activeSection === "rules"}
            onToggle={() => toggle("rules")}
          >
            <div className="text-right text-xs text-ink-muted space-y-2 leading-relaxed">
              <p>• כל משתתף ממלא טופס ניחושים לכל משחקי המונדיאל.</p>
              <p>• ניתן להגיש יותר מטופס אחד.</p>
              <p>• ניקוד מחושב אוטומטית לפי תוצאות בפועל.</p>
              <p>• ניחוש הכרעה נכונה (ניצחון/תיקו) מזכה בנקודות בסיס.</p>
              <p>• ניחוש תוצאה מדויקת מזכה בבונוס נוסף.</p>
              <p>• ניחוש נכון של קבוצה עולה בנוקאאוט מזכה בנקודות עליה.</p>
              <p>• בונוסים ניתנים על ניחוש אלופה ומלך שערים.</p>
              <p>• שערי פנדלים בבעיטות הכרעה לא נספרים למלך השערים.</p>
              <p>• הטפסים ננעלים לפני שריקת הפתיחה.</p>
            </div>
          </MenuSection>

          <MenuSection
            icon="ℹ️"
            title="אודות"
            active={activeSection === "about"}
            onToggle={() => toggle("about")}
          >
            <div className="text-right text-xs text-ink-muted space-y-2 leading-relaxed">
              <p>טורניר הניחושים של קיבוץ בארי למונדיאל 2026.</p>
              <p>ארה״ב 🇺🇸 • מקסיקו 🇲🇽 • קנדה 🇨🇦</p>
              <p>11 ביוני – 19 ביולי 2026</p>
              <p className="text-ink-muted/60 mt-2">גרסה 1.0</p>
            </div>
          </MenuSection>

          <MenuSection
            icon="🛠"
            title="תמיכה טכנית"
            active={activeSection === "support"}
            onToggle={() => toggle("support")}
          >
            <div className="text-right text-xs text-ink-muted space-y-2 leading-relaxed">
              <p>נתקלת בבעיה? יש לך שאלה?</p>
              <a
                href="https://wa.me/972547918413?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%A2%D7%96%D7%A8%D7%94%20%D7%91%D7%98%D7%95%D7%A8%D7%A0%D7%99%D7%A8%20%D7%94%D7%A0%D7%99%D7%97%D7%95%D7%A9%D7%99%D7%9D"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 mt-3 bg-green-500 text-white font-bold py-2.5 px-4 rounded-xl no-underline text-sm hover:bg-green-600 transition"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                שלח ווטסאפ לתמיכה
              </a>
              <p className="text-ink-muted/60 mt-3">
                טיפ: נסה לרענן את הדף אם משהו לא נטען כמו שצריך.
              </p>
            </div>
          </MenuSection>
        </div>
      </div>
    </>
  );
}

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
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-transparent border-none cursor-pointer transition-all text-white/60 hover:text-white hover:bg-white/10"
      >
        <Info size={16} />
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

function BottomMoreSheet({ open, onClose, navigate, page }) {
  if (!open) return null;
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
          {[{ id: "stats", label: "סטטיסטיקות", Icon: BarChart3 }].map(
            ({ id, label, Icon }) => (
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
                <Icon size={20} />
                {label}
              </button>
            ),
          )}
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
    const handler = (e) => {
      setMenuOpen(true);
    };
    document.addEventListener("open-info-drawer", handler);
    return () => document.removeEventListener("open-info-drawer", handler);
  }, []);

  const allNavItems = user
    ? [
        { id: "home", label: "בית" },
        { id: "predict", label: "טפסים" },
        { id: "leaderboard", label: "דירוג" },
        { id: "results", label: "תוצאות" },
        { id: "stats", label: "סטטיסטיקות" },
      ]
    : [{ id: "home", label: "בית" }];
  if (user?.isAdmin) allNavItems.push({ id: "admin", label: "ניהול" });

  const mobileNavItems = user
    ? allNavItems.filter((item) => item.id !== "stats" && item.id !== "admin")
    : allNavItems;

  return (
    <div className="bg-bg">
      <header className="header-gradient text-white sticky top-0 z-50 shadow-lg border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
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
            {allNavItems.map((item) => {
              const Icon = NAV_ICONS[item.id] || Home;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-transparent border-none cursor-pointer transition-all ${
                    page === item.id
                      ? "bg-white/20 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
            <InfoDropdown
              open={infoOpen}
              onToggle={() => setInfoOpen(!infoOpen)}
            />
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold backdrop-blur-sm">
                {(user.displayName || "?").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:inline text-white/90">
                {user.displayName || "משתמש"}
              </span>
              <button
                onClick={logout}
                className="text-xs bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20 transition cursor-pointer border-none text-white/80 font-medium"
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
          {mobileNavItems.map((item) => {
            const Icon = NAV_ICONS[item.id] || Home;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex-1 flex flex-col items-center min-h-[48px] justify-center text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 ${
                  page === item.id ? "text-primary font-bold" : "text-ink-muted"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={page === item.id ? 2.5 : 1.5}
                  className="mb-0.5"
                />
                {item.label}
              </button>
            );
          })}
          {user && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center min-h-[48px] justify-center text-[11px] bg-transparent border-none cursor-pointer transition-colors duration-150 ${
                page === "stats" ? "text-primary font-bold" : "text-ink-muted"
              }`}
            >
              <MoreHorizontal
                size={22}
                strokeWidth={page === "stats" ? 2.5 : 1.5}
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
      />
    </div>
  );
}
