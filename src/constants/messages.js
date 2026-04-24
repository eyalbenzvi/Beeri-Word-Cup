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

