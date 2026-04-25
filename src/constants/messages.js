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

// Copy for the daily-summary blog feature. Kept together so tone/wording
// stays consistent between the admin editor and the public page, and so a
// future retype is a one-file change.
export const BLOG = {
  navLabel: "בלוג",
  pageTitle: "בלוג המונדיאל",
  archiveHeader: "כל הסיכומים",
  status: {
    draftBadge: "טיוטה",
    publishedBadge: "פורסם",
  },
  editor: {
    newSummary: "סיכום חדש",
    editSummary: (n) => `עריכת סיכום #${n}`,
    saveDraft: "שמור טיוטה",
    publish: "פרסם",
    republish: "שמור ופרסם",
    unpublish: "החזר לטיוטה",
    back: "חזרה",
    saved: "נשמר",
    draftSaved: "טיוטה נשמרה",
    published: "הסיכום פורסם",
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
    aiThinking: "חושב...",
    aiPolishing: "משפר...",
    aiSuggestTitle: "הצע כותרת",
    aiPolish: "שפר נוסח",
    aiDraftMatch: "הצע טיוטה",
    aiDraftReady: "טיוטה מוכנה",
    aiTitleUpdated: "הכותרת עודכנה",
    aiPolished: "נוסח משופר",
    aiEmptyInput: "כתוב קודם הקדמה או סיכום",
    aiEmptyTextInput: "אין מה לשפר — הטקסט ריק",
    aiFailed: "AI נכשל",
  },
  public: {
    latestBadge: (n) => `📰 יש סיכום חדש יותר: #${n}`,
    notFoundTitle: (n) => `לא מצאנו סיכום #${n}`,
    notFoundBody: "ייתכן שהקישור פג תוקף או שהסיכום נמחק.",
    notFoundCta: "לסיכום האחרון",
    emptyTitle: "אין עדיין סיכומים",
    emptyBody: "ברגע שהאדמין יפרסם את הסיכום הראשון, הוא יופיע כאן.",
    draftBanner: "⚠️ תצוגת טיוטה — רק אדמין רואה את זה.",
    guestTitle: "👋 ברוך הבא לבלוג המונדיאל של בארי",
    guestBody: "התחבר כדי לראות את הדירוג ומי קלע מדויק.",
    guestCta: "כניסה למונדיאל",
  },
  share: {
    copied: "הקישור הועתק",
    shareAria: "שתף",
    whatsappAria: "שתף בוואטסאפ",
  },
};

