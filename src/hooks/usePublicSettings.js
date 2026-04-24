import { useEffect, useState } from "react";

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

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        // Bust any intermediate caches so the client always gets fresh
        // match results right after the admin updates them.
        const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, {
          credentials: "omit",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
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
