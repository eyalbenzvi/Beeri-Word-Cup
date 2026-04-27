import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const NavigationContext = createContext();

// Pages supported via URL query parameters. Only these are rehydrated from
// `?page=...` on load, so bogus or legacy values can't drop the user onto
// an unrendered page.
const URL_PAGES = new Set(["home", "predict", "leaderboard", "results", "stats", "admin", "profile", "blog"]);

// Query-string params we care about. Anything else is preserved on navigation
// via URLSearchParams.
const KNOWN_PARAM_KEYS = ["n"];

function readInitialFromURL() {
  if (typeof window === "undefined") return { page: "home", params: {} };
  try {
    const sp = new URLSearchParams(window.location.search);
    const rawPage = sp.get("page");
    const page = rawPage && URL_PAGES.has(rawPage) ? rawPage : "home";
    const params = {};
    for (const key of KNOWN_PARAM_KEYS) {
      const v = sp.get(key);
      if (v != null) params[key] = v;
    }
    return { page, params };
  } catch {
    return { page: "home", params: {} };
  }
}

function buildURL(page, params) {
  try {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    // Drop known params; page is stored in `page` query param (home=no param).
    sp.delete("page");
    for (const key of KNOWN_PARAM_KEYS) sp.delete(key);
    if (page && page !== "home") sp.set("page", page);
    for (const [k, v] of Object.entries(params || {})) {
      if (v == null || v === "") continue;
      if (typeof v !== "string" && typeof v !== "number") continue;
      sp.set(k, String(v));
    }
    const search = sp.toString();
    return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  } catch {
    return null;
  }
}

// `replace` controls browser history: push (default) creates a new entry so
// Back/Forward works across in-app navigation; replace is for URL-sync where
// no new entry is desired (e.g. upgrading `?page=blog` to `?page=blog&n=3`).
function writeURL(page, params, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const newURL = buildURL(page, params);
  if (!newURL) return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (newURL === current) return; // no-op, keep the stack clean
  try {
    if (replace) window.history.replaceState({}, "", newURL);
    else window.history.pushState({}, "", newURL);
  } catch {
    // noop — URL updates are best-effort
  }
}

export function NavigationProvider({ children }) {
  const initial = useMemo(() => readInitialFromURL(), []);
  const [page, setPage] = useState(initial.page);
  const [params, setParams] = useState(initial.params);

  // Handle back/forward browser navigation — read straight from the URL so
  // we don't get out of sync if another script mutated history.
  // Also reset scroll on Back/Forward so the user doesn't land mid-page.
  useEffect(() => {
    const onPop = () => {
      const next = readInitialFromURL();
      setPage(next.page);
      setParams(next.params);
      try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* noop */ }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // `options.replace`: true for URL-sync (e.g. auto-jump to latest summary);
  // default (false) pushes a new history entry so Back/Forward works.
  // `behavior: "auto"` is the spec value for an instant scroll; older code
  // used the non-standard "instant" alias which most browsers tolerate.
  const navigate = useCallback((p, nextParams = {}, options = {}) => {
    setPage(p);
    setParams(nextParams || {});
    writeURL(p, nextParams || {}, { replace: !!options.replace });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const value = useMemo(() => ({ page, params, navigate }), [page, params, navigate]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
