import { useEffect, useState } from "react";

// Poll the public-settings Netlify function so the welcome screen can
// react to lock-state changes while a logged-out visitor is looking at
// it. The underlying endpoint uses the Firebase Admin SDK and bypasses
// Firestore security rules, so it works even when rules haven't been
// deployed to expose `gameData/settings` publicly.

const ENDPOINT = "/.netlify/functions/get-public-settings";
const POLL_INTERVAL_MS = 20_000;

const DEFAULT_SETTINGS = { predictionsLocked: false };

export function usePublicSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch(ENDPOINT, { credentials: "omit" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSettings({ predictionsLocked: !!data?.predictionsLocked });
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

  return settings;
}
