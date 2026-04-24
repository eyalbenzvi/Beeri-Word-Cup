import { useEffect, useRef, useState } from "react";

// Poll the public-settings Netlify function so the welcome screen can
// react to lock-state and match-result changes while a logged-out visitor
// is looking at it. The underlying endpoint uses the Firebase Admin SDK
// and bypasses Firestore security rules, so it works even when rules
// haven't been deployed to expose `gameData/settings` or
// `gameData/matchResults` publicly.

const ENDPOINT = "/.netlify/functions/get-public-settings";
const POLL_INTERVAL_MS = 20_000;

const DEFAULT_STATE = {
  predictionsLocked: false,
  matchResults: {},
};

export function usePublicSettings() {
  const [state, setState] = useState(DEFAULT_STATE);
  // Cache the last raw response so identical poll payloads skip setState
  // and keep downstream memo deps (matchResults identity) stable.
  const lastBodyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch(ENDPOINT, { credentials: "omit" });
        if (!res.ok) return;
        const text = await res.text();
        if (cancelled) return;
        if (text === lastBodyRef.current) return;
        lastBodyRef.current = text;
        const data = JSON.parse(text);
        setState({
          predictionsLocked: !!data?.predictionsLocked,
          matchResults:
            data?.matchResults && typeof data.matchResults === "object"
              ? data.matchResults
              : {},
        });
      } catch {
        // Network / parsing errors: keep last-known value silently.
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
