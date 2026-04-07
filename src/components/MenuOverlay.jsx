import { useState, useEffect } from "react";
import { X } from "lucide-react";
import ScoringTable from "./ScoringTable";

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

export default function MenuOverlay({ open, onClose }) {
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  const toggle = (id) => setActiveSection(activeSection === id ? null : id);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
        onClick={onClose}
      />
      <div id="menu-overlay" role="dialog" aria-modal="true" aria-label="תפריט מידע" className="fixed top-0 right-0 h-full w-[85%] max-w-sm bg-bg z-[70] shadow-2xl overflow-y-auto animate-slide-in pb-[env(safe-area-inset-bottom)]">
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
            <ScoringTable />
            <p className="text-[11px] text-ink-muted mt-3 leading-relaxed">
              ניקוד הנוקאאוט מבוסס על תוצאת 90 דקות. שערים מבעיטות הכרעה
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
              <p>• שערים מבעיטות הכרעה לא נספרים למלך השערים.</p>
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
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
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
