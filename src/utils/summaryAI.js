// Thin wrapper around the /summary-ai Netlify function. All calls need a
// Firebase ID token (admin custom claim verified server-side). Throws on
// error so the caller can surface a toast — the function itself returns
// user-friendly Hebrew error copy in `error`.
import { auth } from "../firebase";

export const AI_ACTIONS = {
  SUGGEST_TITLE: "suggestTitle",
  POLISH_TEXT: "polishText",
  MATCH_COMMENTARY: "matchCommentary",
};

async function call(action, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("לא מחובר");
  const token = await user.getIdToken();
  const res = await fetch("/.netlify/functions/summary-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `שגיאה (${res.status})`);
  }
  return data;
}

export function suggestTitle({ intro, conclusion, dayNumber }) {
  return call(AI_ACTIONS.SUGGEST_TITLE, { intro, conclusion, dayNumber });
}

export function polishText({ text, kind }) {
  return call(AI_ACTIONS.POLISH_TEXT, { text, kind });
}

export function matchCommentary({ match, result, stats, currentNote }) {
  return call(AI_ACTIONS.MATCH_COMMENTARY, { match, result, stats, currentNote });
}
