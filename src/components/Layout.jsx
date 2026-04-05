import { useState } from 'react';
import { useCurrentUser } from '../hooks/useStore';
import { useNavigation } from '../hooks/useNavigation';

const SCORING_DATA = [
  ['בתים', 1, 3, 2],
  ['שלב ה-32', 3, 3, 4],
  ['רבע גמר', 5, 3, 6],
  ['חצי גמר', 7, 3, 8],
  ['מקום שלישי', 7, 3, null],
  ['גמר', 9, 3, null],
];

function MenuOverlay({ open, onClose }) {
  const [activeSection, setActiveSection] = useState(null);

  if (!open) return null;

  const toggleSection = (id) => setActiveSection(activeSection === id ? null : id);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" onClick={onClose} />

      {/* Slide-in menu */}
      <div className="fixed top-0 right-0 h-full w-[85%] max-w-sm bg-white z-[70] shadow-2xl overflow-y-auto animate-slide-in">
        {/* Menu header */}
        <div className="bg-primary text-white p-5 flex items-center justify-between">
          <button onClick={onClose} className="text-white/80 text-2xl bg-transparent border-none cursor-pointer p-0 leading-none">✕</button>
          <h2 className="text-lg font-extrabold tracking-tight">תפריט</h2>
        </div>

        <div className="p-4 space-y-2">
          {/* שיטת הניקוד */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection('scoring')}
              className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
            >
              <span className="text-gray-400 text-xs">{activeSection === 'scoring' ? '▲' : '▼'}</span>
              <span className="text-sm font-bold text-primary">📊 שיטת הניקוד</span>
            </button>
            {activeSection === 'scoring' && (
              <div className="px-4 pb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b-2 border-gray-100">
                      <th className="text-right py-2 font-semibold">שלב</th>
                      <th className="text-center py-2 font-semibold">הכרעה</th>
                      <th className="text-center py-2 font-semibold">+מדויק</th>
                      <th className="text-center py-2 font-semibold">עליה</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {SCORING_DATA.map(([stage, outcome, exact, advance], i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{stage}</td>
                        <td className="text-center font-bold">{outcome}</td>
                        <td className="text-center font-bold text-green-600">+{exact}</td>
                        <td className="text-center font-bold text-purple-600">{advance ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                    <span className="text-gray-600">🏆 ניחוש אלופה</span>
                    <span className="font-bold text-yellow-600">9 נק׳</span>
                  </div>
                  <div className="flex justify-between items-center bg-yellow-50/60 rounded-xl px-3 py-2">
                    <span className="text-gray-600">⚽ מלך שערים</span>
                    <span className="font-bold text-yellow-600">8 נק׳</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                  ניקוד הנוקאאוט מבוסס על תוצאת 90 דקות. שערי פנדלים בפנדלטים לא נספרים למלך השערים.
                </p>
              </div>
            )}
          </div>

          {/* החוקים */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection('rules')}
              className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
            >
              <span className="text-gray-400 text-xs">{activeSection === 'rules' ? '▲' : '▼'}</span>
              <span className="text-sm font-bold text-primary">📜 החוקים</span>
            </button>
            {activeSection === 'rules' && (
              <div className="px-4 pb-4 text-right text-xs text-gray-600 space-y-2 leading-relaxed">
                <p>• כל משתתף ממלא טופס ניחושים לכל משחקי המונדיאל.</p>
                <p>• ניתן להגיש יותר מטופס אחד.</p>
                <p>• ניקוד מחושב אוטומטית לפי תוצאות בפועל.</p>
                <p>• ניחוש הכרעה נכונה (ניצחון/תיקו) מזכה בנקודות בסיס.</p>
                <p>• ניחוש תוצאה מדויקת מזכה בבונוס נוסף.</p>
                <p>• ניחוש נכון של קבוצה עולה בנוקאאוט מזכה בנקודות עליה.</p>
                <p>• בונוסים ניתנים על ניחוש אלופה ומלך שערים.</p>
                <p>• שערי פנדלים בפנדלטים לא נספרים למלך השערים.</p>
                <p>• הטפסים ננעלים לפני שריקת הפתיחה.</p>
              </div>
            )}
          </div>

          {/* אודות */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection('about')}
              className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
            >
              <span className="text-gray-400 text-xs">{activeSection === 'about' ? '▲' : '▼'}</span>
              <span className="text-sm font-bold text-primary">ℹ️ אודות</span>
            </button>
            {activeSection === 'about' && (
              <div className="px-4 pb-4 text-right text-xs text-gray-600 space-y-2 leading-relaxed">
                <p>טורניר הניחושים של קיבוץ בארי למונדיאל 2026.</p>
                <p>ארה״ב 🇺🇸 • מקסיקו 🇲🇽 • קנדה 🇨🇦</p>
                <p>11 ביוני – 19 ביולי 2026</p>
                <p className="text-gray-400 mt-2">גרסה 1.0</p>
              </div>
            )}
          </div>

          {/* תמיכה טכנית */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection('support')}
              className="w-full flex items-center justify-between p-4 bg-transparent border-none cursor-pointer text-right"
            >
              <span className="text-gray-400 text-xs">{activeSection === 'support' ? '▲' : '▼'}</span>
              <span className="text-sm font-bold text-primary">🛠 תמיכה טכנית</span>
            </button>
            {activeSection === 'support' && (
              <div className="px-4 pb-4 text-right text-xs text-gray-600 space-y-2 leading-relaxed">
                <p>נתקלת בבעיה? יש לך שאלה?</p>
                <a
                  href="https://wa.me/972547918413?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%A2%D7%96%D7%A8%D7%94%20%D7%91%D7%98%D7%95%D7%A8%D7%A0%D7%99%D7%A8%20%D7%94%D7%A0%D7%99%D7%97%D7%95%D7%A9%D7%99%D7%9D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 mt-3 bg-green-500 text-white font-bold py-2.5 px-4 rounded-xl no-underline text-sm hover:bg-green-600 transition"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  שלח ווטסאפ לתמיכה
                </a>
                <p className="text-gray-400 mt-3">טיפ: נסה לרענן את הדף אם משהו לא נטען כמו שצריך.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useCurrentUser();
  const { page, navigate } = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white text-xl bg-transparent border-none cursor-pointer p-1 leading-none"
              aria-label="תפריט"
            >
              ☰
            </button>
            <button
              onClick={() => navigate('home')}
              className="text-lg font-bold text-white flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 tracking-tight"
            >
              <img src="https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png" alt="בארי" className="h-9 w-auto object-contain" />
              בארי מונדיאל
            </button>
          </div>
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

      {/* Hamburger Menu */}
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Main Content */}
      <main className="max-w-lg mx-auto w-full px-4 pt-4 pb-16">
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
