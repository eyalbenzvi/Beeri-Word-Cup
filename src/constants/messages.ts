// Shared UI copy. Centralised so that lock messaging stays identical across
// Home, Predict, FormList, AllForms, and Leaderboard.
export const LOCK_MESSAGES = {
  tournamentStarted: "המשחקים התחילו — ההגשה נסגרה",
  formsUnavailable: "לא ניתן ליצור טפסים חדשים לאחר תחילת המשחקים",
  predictionsHiddenBeforeLock: "הניחושים יוצגו לאחר נעילת הטורניר",
};

export const AUTH_COPY = {
  loginRequiredTitle: "התחבר למשחק קודם",
  loginRequiredSubtitle: "צריך לבחור שם כדי למלא ניחושים",
  loginCta: "התחבר למשחק",
};

// Brand strings — single source of truth. Changing the tagline here
// updates Home, WelcomeScreen (mobile + desktop panels) in one shot.
export const BRAND = {
  tournamentTitle: "טורניר הניחושים של בארי",
  subtitle: "מונדיאל 2026",
  hosts: "ארה״ב • מקסיקו • קנדה",
  tagline: "מונדיאל 2026 · ארה״ב • מקסיקו • קנדה",
  countdownHeader: "הזמן שנותר לפתיחה",
};

// Canonical Hebrew labels for the bonus/leaderboard vocabulary. Used everywhere
// a form, row, card, or CSV needs one of these terms — prevents the historical
// drift between "מלך שערים" / "מלך השערים" and "מדויקים" / "מדויקות".
// Canonical choices:
//   • "מלך השערים" (definite form, standard Hebrew idiom)
//   • "מדויקים"   (masculine, agrees with "ניחושים")
const TOP_SCORER = "מלך השערים";
const CHAMPION = "אלופה";
export const LABELS = {
  topScorer: TOP_SCORER,
  guessTopScorer: `ניחוש ${TOP_SCORER}`,
  champion: CHAMPION,
  guessChampion: `ניחוש ${CHAMPION}`,
  exactCount: "מדויקים",
  outcomeCount: "הכרעות",
  forms: "טפסים",
  formsMine: "הטפסים שלי",
  rank: "מקום",
  pointsShort: "נק׳",
  pointsTotalShort: "סה״כ",
  topScorerAria: (name) => `${TOP_SCORER}: ${name}`,
  championAria: (name) => `${CHAMPION}: ${name}`,
};

// Copy for the home-page LiveNow card + "הניקוד שלך" strip. Centralised so
// the live vocabulary stays consistent ("כרגע" = provisional/live, "לפי
// משחקים שנגמרו" = official) and tests can lock the contract down.
// Verdict POINT VALUES are never embedded here — they arrive as arguments
// straight from the scoring engine (see src/utils/liveScores.ts).
export const LIVE = {
  liveChip: "לייב",
  todayChip: "היום",
  halftime: "מחצית",
  extraTime: "הארכה",
  finished: "נגמר",
  playingNow: "משוחק עכשיו",
  minuteMark: (m) => `${m}׳`,
  // Verdicts — always prefixed "כרגע" (live, provisional), never red.
  // ‎ (LRM) keeps "+4" reading left-to-right inside the RTL sentence —
  // without it the plus sign visually flips to the wrong side of the digits.
  exactNow: "כרגע מדויק!",
  exactWorth: (pts) => `שווה ‎+${pts} נק׳ אם זה יישאר`,
  outcomeNow: (pts) => `הכרעה נכונה כרגע — ‎+${pts} נק׳`,
  noneNow: "כרגע בלי נקודות",
  // Past-tense verdicts for the just-finished state.
  finishedExact: (pts) => `פגיעה מדויקת — ‎+${pts} נק׳`,
  finishedOutcome: (pts) => `הכרעה נכונה — ‎+${pts} נק׳`,
  finishedNone: "הפעם בלי נקודות",
  extraTimeNote: "הניקוד ייקבע לפי 90 הדקות",
  differentTeams: "קבוצות שונות בטופס",
  // Multi-form rollup — exhaustive count, always sums to the form total.
  formsScoringNow: (scoring, total) =>
    `צוברים נקודות כרגע: ${scoring} מתוך ${total} טפסים`,
  yourPrediction: "הניחוש שלך",
  yourForms: (n) => `הטפסים שלך (${n})`,
  // Pre-match / rest-day
  nextMatchLabel: "המשחק הבא",
  todayAt: (time) => `היום ב־${time}`,
  startsIn: (txt) => `בעוד ${txt}`,
  moreToday: (n) => (n === 1 ? "ועוד משחק אחד היום" : `ועוד ${n} משחקים היום`),
  // Freshness honesty
  refreshNote: "מתעדכן בכל דקה בערך",
  staleNote: (mins) => `עודכן לפני ${mins} דק׳`,
  apiDownNote: "אין לנו תוצאה חיה כרגע — ננסה שוב בעוד דקה",
  versus: "מול",
};

export const SCORE_STRIP = {
  header: "הניקוד שלך",
  officialOnly: "לפי משחקים שנגמרו",
  todayPoints: (pts) => `היום: ‎+${pts} נק׳`,
  yesterdayPoints: (pts) => `אתמול: ‎+${pts} נק׳`,
  rankOf: (rank, total) => `מקום ${rank} מתוך ${total}`,
  leadingForm: "הטופס המוביל שלך",
  toLeaderboard: "לטבלת הדירוג",
};

export const SUMMARY_TEASER = {
  readCta: "לקריאה",
  title: (n) => `סיכום יום ${n} עלה`,
};

// Copy for the daily-summary blog feature. Kept together so tone/wording
// stays consistent between the admin editor and the public page, and so a
// future retype is a one-file change.
export const BLOG = {
  navLabel: "בלוג",
  pageTitle: "בלוג המונדיאל",
  archiveHeader: "כל הסיכומים",
  status: {
    draftBadge: "עוד לא פורסם",
    publishedBadge: "באוויר",
  },
  editor: {
    newSummary: "מתחילים סיכום",
    editSummary: (n) => `עריכת סיכום #${n}`,
    saveDraft: "שמור טיוטה",
    publish: "פרסם",
    republish: "שמור ופרסם",
    unpublish: "החזר לטיוטה",
    back: "חזרה",
    saved: "נשמר",
    draftSaved: "טיוטה נשמרה",
    published: "הסיכום באוויר",
    unpublished: "הוחזר לטיוטה",
    deleted: "הסיכום נמחק",
    titleRequired: "חובה למלא כותרת",
    saveFailed: "שמירה נכשלה",
    createFailed: "יצירה נכשלה",
    publishFailed: "פרסום נכשל",
    deleteFailed: "מחיקה נכשלה",
    deletedMidEditTitle: "הסיכום נמחק",
    deletedMidEditBody: "מישהו (או אתה בחלון אחר) מחק את הסיכום שערכת.",
    deletedMidEditToast: "הסיכום נמחק. יש לפתוח סיכום אחר.",
    aiThinking: "רגע, חושב על זה...",
    aiPolishing: "מלטש...",
    aiSuggestTitle: "תן לי כותרת",
    aiPolish: "לשפץ קצת",
    aiDraftMatch: "מה הסיפור פה?",
    aiDraftReady: "יש טיוטה",
    aiTitleUpdated: "הכותרת עודכנה",
    aiPolished: "נוסח משופר",
    aiEmptyInput: "כתוב קודם הקדמה או סיכום",
    aiEmptyTextInput: "אין מה לשפר — הטקסט ריק",
    aiFailed: "AI נכשל",
    // Editor view modes (mobile tab toggle, desktop split-view label)
    tabWrite: "כתיבה",
    tabPreview: "תצוגה מקדימה",
    // Suggestion panel ("piquant ideas")
    suggestionsHeading: "💡 רעיונות פיקנטיים",
    suggestionsGlobalHeading: "💡 רעיונות לפתיחה ולסיכום",
    suggestionsEmpty: "אין מה לציין במיוחד — היום היה צפוי.",
    suggestionInsertAria: (text) => `הוסף לטקסט: ${text}`,
    // Placeholders that nudge the writer toward an angle, not a date
    placeholderTitle: "למשל: היום שבו כולם טעו לגבי גרמניה",
    placeholderSubtitle: "שורה אחת — מה הסיפור של היום?",
    placeholderIntro: "במה נפתח? נתון שהפתיע אותך, מישהו שקלע נגד כל הסיכויים, או רק תזכורת ליום עמוס.",
    placeholderMatchNote: "מה הפתיע פה? מי קלע בדיוק שלא ציפית? אפשר גם משפט אחד.",
    placeholderConclusion: "מה לקחנו מהיום? מי בעלייה, מה מחכה מחר, או סתם מילה חמה לסיום.",
  },
  public: {
    latestBadge: (n) => `יצא סיכום חדש יותר — #${n}`,
    notFoundTitle: (n) => `לא מצאנו סיכום #${n}`,
    notFoundBody: "ייתכן שהקישור פג תוקף או שהסיכום נמחק.",
    notFoundCta: "לסיכום האחרון",
    emptyTitle: "אין עדיין סיכומים",
    draftBanner: "זו עוד טיוטה — רק אתה רואה אותה.",
    // Per-match exact-hit surfacing (now above the fold)
    exactHitsLabel: (count) => `קלעו בדיוק (${count}):`,
    exactHitsNone: "אף אחד לא קלע בדיוק.",
    exactHitsMore: (n) => `+${n} עוד`,
  },
  share: {
    copied: "הקישור הועתק",
    shareAria: "שתף",
    whatsappAria: "שתף בוואטסאפ",
  },
};

