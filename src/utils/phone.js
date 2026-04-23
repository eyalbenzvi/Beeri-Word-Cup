// Israeli mobile phone validation, normalization, and input sanitization.
// Shared by the client sign-in UI and Netlify OTP functions so both sides
// agree on the canonical form — the canonical form is what becomes the UID
// (phone_05XXXXXXXX) and the HMAC/rate-limit key.

// Active Israeli mobile prefixes. 051/056/057/059 are intentionally excluded
// (not assigned to commercial mobile carriers in practice).
export const ISRAELI_MOBILE_PREFIXES = ["050", "052", "053", "054", "055", "058"];

// Characters the user is allowed to type/paste into the phone input.
// Digits + international/formatting glyphs. Anything else is stripped live.
const ALLOWED_INPUT_CHARS = /[^0-9+\-()\s.]/g;

// Invisible characters that often piggy-back on pasted phone numbers
// (e.g. WhatsApp, iOS contact cards): zero-width space/joiner, LTR/RTL marks,
// directional isolates/embedding, word joiner, BOM, non-breaking space.
const INVISIBLE_CHARS = /[​-‏‪-‮⁠﻿ ]/g;

const MAX_INPUT_LEN = 20; // longest sane format "+972-50-123-4567" = 17

// Live input filter. Keep only allowed characters, drop invisibles, cap length.
export function sanitizePhoneInput(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(INVISIBLE_CHARS, "")
    .replace(ALLOWED_INPUT_CHARS, "")
    .slice(0, MAX_INPUT_LEN);
}

// Normalize any accepted Israeli-mobile format to canonical "05XXXXXXXX".
// Returns null if the input cannot be interpreted as a valid Israeli mobile.
// Accepts: 0501234567, 050-123-4567, 050 123 4567, 050.123.4567,
//          (050) 123-4567, +972501234567, +972-50-123-4567,
//          972501234567, 00972501234567.
export function normalizeIsraeliMobile(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(INVISIBLE_CHARS, "").trim();
  if (!s) return null;

  // Reject anything that isn't a digit or an accepted formatting glyph —
  // this catches Arabic-Indic digits, letters, emoji, control chars, etc.
  if (/[^0-9+\-()\s.]/.test(s)) return null;

  // The leading "+" is significant for country-code detection; remember it
  // before we strip all non-digits.
  const hadPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");

  // Country-code handling: "+972…" / "00972…" / bare "972…" → "0…"
  if (hadPlus && s.startsWith("972")) {
    s = "0" + s.slice(3);
  } else if (!hadPlus && s.startsWith("00972")) {
    s = "0" + s.slice(5);
  } else if (!hadPlus && s.length === 12 && s.startsWith("972")) {
    // Bare "972501234567" without "+" or "00" — only treat as international
    // when length matches exactly, to avoid misreading a local number that
    // happens to start with 972.
    s = "0" + s.slice(3);
  }

  if (!/^\d{10}$/.test(s)) return null;
  const prefix = s.slice(0, 3);
  if (!ISRAELI_MOBILE_PREFIXES.includes(prefix)) return null;
  return s;
}

export function isValidIsraeliMobile(raw) {
  return normalizeIsraeliMobile(raw) !== null;
}
