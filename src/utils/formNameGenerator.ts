// Default fallback when the user has no nickname yet (defensive — new users
// get displayName: "משתמש" on creation, but might be empty in legacy data).
export const DEFAULT_FORM_NAME_FALLBACK = "טופס";

// Statuses that block duplicate form names per formValidation.js.
// A default name that collides with any of these would fail submission later.
const BLOCKING_STATUSES = new Set(["submitted", "approved", "pending"]);

function normalize(name) {
  return (name || "").trim().toLowerCase();
}

// First form: "{nickname}". Subsequent: "{nickname} 2", "{nickname} 3", …
// Avoids collisions with:
//   1) Every form owned by this user (any status) — so the list stays readable.
//   2) submitted/approved/pending forms of *any* user — so the auto-generated
//      name won't trip the unique-name submission rule (see formValidation.js).
export function generateDefaultFormName({
  nickname,
  userForms = [],
  allPredictions = {},
}: { nickname?: string; userForms?: any[]; allPredictions?: Record<string, any> } = {}) {
  const base = (nickname || "").trim() || DEFAULT_FORM_NAME_FALLBACK;

  const taken = new Set<string>();
  for (const f of userForms) {
    const n = normalize(f?.formName);
    if (n) taken.add(n);
  }
  for (const fAny of Object.values(allPredictions || {})) {
    const f = fAny as any;
    if (!BLOCKING_STATUSES.has(f?.status)) continue;
    const n = normalize(f?.formName);
    if (n) taken.add(n);
  }

  if (!taken.has(normalize(base))) return base;

  // Upper bound is defensive: MAX_FORMS_PER_USER is 10 and submissions across
  // all users are bounded, so in practice we return within a handful of steps.
  for (let i = 2; i <= 10000; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(normalize(candidate))) return candidate;
  }
  return `${base} ${Date.now()}`;
}
