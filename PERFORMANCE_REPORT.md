# דוח ביצועים מקיף - Beeri World Cup

## סיכום מנהלים

בדיקה מעמיקה של כל הפונקציות והרכיבים באתר. כל הקבצים נבדקו ומופו את כל נקודות הסיכון לביצועים.

**היקף הנתונים:** האתר מכיל 72 משחקי בתים + ~32 משחקי נוקאאוט = **104 משחקים** לכל טופס. כל משתמש יכול ליצור עד **10 טפסים**.

---

## בעיה קריטית #1: חישוב הלידרבורד - O(N × M) לכל שינוי

**קובץ:** `src/hooks/useLeaderboardComputed.js:27-41`

**מהות הבעיה:** הפונקציה `formBracketMap` מחשבת את כל ה-bracket מחדש לכל טופס שהוגש בכל פעם שמשהו ב-`allPredictions` משתנה. `calcBracketTeams()` כולל:
- חישוב טבלאות ל-12 בתים (iterations על 72 משחקים)
- מיון tiebreakers עם רקורסיה (`sortTiedGroup`)
- חישוב 8 שלישיות טובות ביותר
- מעבר על כל שלבי הנוקאאוט (R32→R16→QF→SF→Final)

```javascript
// שורות 27-41 — לולאה על כל הטפסים × חישוב bracket כבד
const formBracketMap = useMemo(() => {
  const map = {};
  for (const [formId, predData] of Object.entries(allPredictions)) {
    const predBracket = calcBracketTeams(matchPreds); // ~1000 iterations
    map[formId] = {
      predBracket,
      advancing: deriveAdvancingTeams(predBracket),
      champion: deriveChampion(matchPreds, predBracket),
    };
  }
  return map;
}, [allPredictions]);
```

**הערכת סיכון:** עם 100 טפסים, זה ~100,000 iterations בכל שינוי. עם 200+ טפסים — עיכוב של 1-3 שניות. עם 500+ — עלול להרגיש תקוע (5+ שניות).

---

## בעיה קריטית #2: כל המשתמשים ב-document בודד של Firestore

**קובץ:** `src/store.js:62-64, 97-99`

**מהות הבעיה:** כל המשתמשים נשמרים במסמך אחד ב-Firestore:
```
gameData/users → { data: { uid1: {...}, uid2: {...}, ... } }
```

**בעיות:**
1. **Firestore document size limit = 1MB.** כל משתמש ~500 bytes → מגבלה של ~2,000 משתמשים
2. **כל עדכון למשתמש בודד** שולח את כל המסמך ל-listeners
3. **כל login = snapshot trigger** → re-render של כל הקומפוננטות שתלויות ב-users

**הערכת סיכון:** עם 50+ מחוברים — כל login גורר 50 snapshot triggers.

---

## בעיה קריטית #3: קאש bracket עם sampling key שעלול לגרום לקולוזיות

**קובץ:** `src/utils/bracketCache.js:8-16`

```javascript
function getStableKey(matchPredictions) {
  const entries = Object.entries(matchPredictions);
  const samples = entries.filter((_, i) => i % 5 === 0) // רק 20% מהנתונים!
    .map(([id, p]) => `${id}:${p?.homeScore ?? ''}-${p?.awayScore ?? ''}`)
    .join('|');
  return `${entries.length}_${samples}`;
}
```

**בעיה:** שני טפסים שונים באותם 80% שלא נדגמו → אותו key → תוצאה שגויה מהקאש. **זו באג שקט — לא crash, אלא תוצאות שגויות.**

---

## בעיה #4: MatchCard ללא React.memo — re-renders מיותרים

**קובץ:** `src/components/MatchCard.jsx:30`, `src/pages/Predict.jsx:569-602`

כל MatchCard מרונדר מחדש כאשר כל state ב-Predict משתנה (9 useState hooks). בנוסף, `onPredictionChange` יוצר פונקציה חדשה (inline arrow) לכל render.

**הערכת סיכון:** 6-16 re-renders לכל keystroke.

---

## בעיה #5: focusNextInput - DOM query על כל הכרטיסים

**קובץ:** `src/components/MatchCard.jsx:5-28`

```javascript
const allCards = document.querySelectorAll("[data-match-card]");
const cardIdx = Array.from(allCards).indexOf(card); // O(N) search
```

**הערכת סיכון:** נמוך-בינוני. מוגבל ל-6-16 כרטיסים בפרקטיקה.

---

## בעיה #6: Leaderboard ללא virtualization

**קובץ:** `src/pages/Leaderboard.jsx:250-337`

```javascript
leaderboard.slice(0, showCount).map((entry, index) => { ... })
```

**הערכת סיכון:** עד 100 — סביר. מעל 200 — lag בגלילה במכשירים ניידים.

---

## בעיה #7: Stats page — חישוב champion לכל טופס

**קובץ:** `src/pages/Stats.jsx:232-243`

לכל טופס, אם הקאש ריק, מחשב bracket מלא. עם 200 טפסים ללא cache hit — עיכוב של 2-5 שניות.

---

## בעיה #8: SearchStats ללא debounce

**קובץ:** `src/pages/Stats.jsx:374-446`

כל שינוי ב-query מפעיל useMemo מחדש. 200 טפסים × 104 משחקים = ~20,800 iterations לכל אות.

---

## בעיה #9: Store events → global re-renders

**קובץ:** `src/store.js:287-289, 458`

כל שינוי ב-cache מפעיל CustomEvent → כל ה-useSyncExternalStore subscriptions. כל הקלדה גוררת re-render של כל הדפים.

---

## בעיה #10: Firestore batch limit 500

**קובץ:** `src/store.js:907-977`

Firestore batch מוגבל ל-500 operations. 50 משתמשים × 10 טפסים = 500 → batch יכשל.

---

## בעיה #11: getFormsForUser — סריקה ליניארית

**קובץ:** `src/store.js:644-654`

כל קריאה סורקת את כל הטפסים ומסננת. נקראת בכל render.

---

## בעיה #12: תלות מעגלית בין listeners

**קובץ:** `src/store.js:413-415`

עדכון settings/users → maybeUpgradePredictionsListener → snapshot ראשון כבד.

---

## בעיה #13: structuredClone overhead

**קובץ:** `src/store.js:134, 224, 250, 274`

`structuredClone` על objects גדולים בכל write. נמוך בפרקטיקה.

---

## סיכום טבלאי

| # | בעיה | חומרה | סף בעייתי | השפעה |
|---|-------|--------|-----------|-------|
| 1 | חישוב Leaderboard O(N×M) | **קריטי** | 100+ טפסים | 1-5 שניות freeze |
| 2 | כל המשתמשים ב-doc אחד | **קריטי** | 50+ מחוברים | re-render storms, 1MB limit |
| 3 | קאש bracket עם sampling key | **קריטי** | טפסים דומים | תוצאות שגויות (באג!) |
| 4 | MatchCard ללא React.memo | **בינוני** | תמיד | 6-16 re-renders לכל keystroke |
| 5 | focusNextInput DOM scan | **נמוך** | >20 כרטיסים | DOM query איטי |
| 6 | Leaderboard ללא virtualization | **בינוני** | 200+ entries | lag בגלילה |
| 7 | Stats champion calculation | **בינוני** | 200+ טפסים | 2-5 שניות delay |
| 8 | Search ללא debounce | **בינוני** | 200+ טפסים | lag בהקלדה |
| 9 | Store events → global re-renders | **בינוני** | 50+ מחוברים | כל שינוי → כל הדפים |
| 10 | Firestore batch limit 500 | **בינוני-גבוה** | 495+ טפסים | crash ב-clear/import |
| 11 | getFormsForUser linear scan | **נמוך** | 500+ טפסים | חישוב מיותר |
| 12 | Listener upgrade cascade | **נמוך** | פעם אחת | render כבד חד-פעמי |
| 13 | structuredClone overhead | **נמוך** | edge case | זניח |

---

## המלצות לפי עדיפות

### עדיפות 1 — חייבים לתקן:

1. **תקן bracket cache key** — hash מלא על כל ה-entries, לא sampling
2. **Web Worker לחישוב leaderboard** — חישובי bracket + scoring ב-worker thread
3. **פצל users ל-documents נפרדים** — collection במקום document אחד

### עדיפות 2 — שיפור משמעותי:

4. **React.memo ל-MatchCard** — עם comparator מותאם
5. **Debounce ל-SearchStats** — 300ms delay
6. **פצל batch operations** — batches של 400 operations

### עדיפות 3 — אופטימיזציה:

7. **Virtualization ללידרבורד** — react-window / @tanstack/virtual
8. **הפסק inline arrow functions** — useCallback עם matchId
9. **Index ל-cache.predictions** — מפתח byUserId

---

## שורה תחתונה

- **20-30 משתמשים, 50-100 טפסים** — ירוץ חלק
- **100+ משתמשים, 200+ טפסים** — freeze מורגש בלידרבורד ובסטטיסטיקות
- **500+ טפסים** — batch יכשל, לידרבורד לא שמיש, קאש עלול להחזיר תוצאות שגויות
- **הבעיה הדחופה ביותר: #3** (bracket cache key) — באג פונקציונלי, לא רק ביצועים
