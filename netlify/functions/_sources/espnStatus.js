// Shared ESPN status/score helpers, used by BOTH ESPN adapters (espnLive.js
// for the live card, espnResult.js for official auto-fill). Centralized so the
// "did it finish / go to extra time / get abandoned" judgement can never drift
// between the live UI and the recorded result — they must agree.

// ESPN status tokens are often underscore-joined (e.g. "STATUS_FINAL_AET").
// Underscore is a regex word char, so \bAET\b would NOT match inside
// "FINAL_AET". Normalize every non-alphanumeric run to a space so the token
// matchers below behave ("STATUS_FINAL_AET" -> "STATUS FINAL AET", "FT (Pens)"
// -> "FT PENS ").
function statusText(status) {
  const type = status?.type || {};
  return `${type.name || ""} ${type.detail || ""} ${type.shortDetail || ""}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ");
}

// Terminal NON-played states (abandoned/cancelled/...). ESPN reports these with
// state === "post" too, so isFinished must exclude them — otherwise a partial
// or 0-0 score from an abandoned match would be recorded as a real result.
export function espnIsAbandoned(status) {
  return /\b(ABANDON|ABANDONED|CANCEL|CANCELED|CANCELLED|POSTPON|POSTPONED|SUSPEND|SUSPENDED|FORFEIT|AWARDED|WALKOVER)\b/.test(
    statusText(status),
  );
}

// A genuinely completed, played-to-conclusion match.
export function espnIsFinished(status) {
  if (espnIsAbandoned(status)) return false;
  const type = status?.type || {};
  return type.completed === true || type.state === "post";
}

// REGULAR / EXTRA_TIME / PENALTY_SHOOTOUT. The authoritative signal is the
// period number (1/2 regulation, 3/4 ET, 5 pens); the status text is used ONLY
// for unambiguous abbreviation tokens (AET, PEN, SHOOTOUT). We deliberately do
// NOT match the bare words "EXTRA"/"OVERTIME"/"EXTRA TIME" — prose like
// "extra time not played" on a regular-time match would otherwise misclassify
// it and send the 90' score down the linescores path.
export function espnDuration(status) {
  const period = Number.isInteger(status?.period) ? status.period : null;
  const txt = statusText(status);
  if (/\b(PEN|PENS|SHOOTOUT)\b/.test(txt) || period === 5) return "PENALTY_SHOOTOUT";
  if ((period != null && period > 2) || /\bAET\b/.test(txt)) return "EXTRA_TIME";
  return "REGULAR";
}

// Parse a goal count that may be a number, a numeric string ("2"), or an ESPN
// linescore/score object ({ value } / { displayValue }). Non-numeric -> null.
export function espnGoals(v) {
  const raw = v && typeof v === "object" ? (v.value != null ? v.value : v.displayValue) : v;
  if (Number.isFinite(raw)) return Number(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return null;
}
