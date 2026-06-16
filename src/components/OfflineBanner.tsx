import { useEffect, useState } from "react";

// Quiet, app-wide connectivity indicator. The store layer already RECOVERS
// from offline internally (listeners.ts re-inits on the `online` event), but
// nothing told the user WHY data looked stale. This surfaces that state so a
// flaky-network user understands the app isn't broken — it's waiting for a
// connection — and disappears the moment connectivity returns.
//
// SSR/jsdom-safe: navigator.onLine defaults to true when unknown, so the
// banner stays hidden unless the browser explicitly reports offline.
function readOnline() {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

export default function OfflineBanner() {
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Re-sync once on mount in case the event fired before we subscribed.
    setOnline(readOnline());
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-danger text-white text-xs font-bold text-center px-4 py-1.5"
    >
      אין חיבור לאינטרנט — ייתכן שחלק מהנתונים לא יתעדכנו
    </div>
  );
}
