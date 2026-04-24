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

function writeURL(page, params) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    // Drop known params; page is stored in `page` query param (home=no param).
    sp.delete("page");
    for (const key of KNOWN_PARAM_KEYS) sp.delete(key);
    if (page && page !== "home") sp.set("page", page);
    for (const [k, v] of Object.entries(params || {})) {
      if (v == null || v === "") continue;
      sp.set(k, String(v));
    }
    const search = sp.toString();
    const newURL = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    window.history.replaceState({}, "", newURL);
  } catch {
    // noop — URL updates are best-effort
  }
}

export function NavigationProvider({ children }) {
  const initial = useMemo(() => readInitialFromURL(), []);
  const [page, setPage] = useState(initial.page);
  const [params, setParams] = useState(initial.params);

  // Sync URL on state change
  useEffect(() => {
    writeURL(page, params);
  }, [page, params]);

  // Handle back/forward browser navigation
  useEffect(() => {
    const onPop = () => {
      const next = readInitialFromURL();
      setPage(next.page);
      setParams(next.params);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((p, nextParams = {}) => {
    setPage(p);
    setParams(nextParams || {});
    window.scrollTo({ top: 0, behavior: 'instant' });
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
