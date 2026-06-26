import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { scrollAppToTop } from '../utils/appScroll';

const NavigationContext = createContext<any>(null);

// Pages supported via URL query parameters. Only these are rehydrated from
// `?page=...` on load, so bogus or legacy values can't drop the user onto
// an unrendered page.
const URL_PAGES = new Set(["home", "predict", "leaderboard", "results", "stats", "admin", "profile", "blog", "simulator"]);

// Query-string params we care about. Anything else is preserved on navigation
// via URLSearchParams.
//   n       — summary index (blog deep links)
//   form    — active form id under /predict
//   stage   — predict stage selector (group/R32/R16/QF/SF/3RD/F)
//   group   — predict group selector (A..L)
//   view    — predict sub-view (e.g. "all" → AllForms)
//   tab     — page-internal tab (e.g. Stats: matches/teams/forms)
//   modal   — top-level dialog (review/search/scenario/aiprogress)
const KNOWN_PARAM_KEYS = ["n", "form", "stage", "group", "view", "tab", "modal"];

// Modals that are valid to express via ?modal=… — bogus values are ignored.
export const VALID_MODALS = new Set(["review", "search", "scenario", "aiprogress"]);

function readInitialFromURL() {
  if (typeof window === "undefined") return { page: "home", params: {} as Record<string, string> };
  try {
    const sp = new URLSearchParams(window.location.search);
    const rawPage = sp.get("page");
    const page = rawPage && URL_PAGES.has(rawPage) ? rawPage : "home";
    const params: Record<string, string> = {};
    for (const key of KNOWN_PARAM_KEYS) {
      const v = sp.get(key);
      if (v != null) params[key] = v;
    }
    // Drop a bogus ?modal=… that isn't a real dialog, mirroring the page
    // allowlist above — otherwise a stale/hand-edited URL would persist an
    // unrenderable modal value in navigation state.
    if (params.modal && !VALID_MODALS.has(params.modal)) delete params.modal;
    return { page, params };
  } catch {
    return { page: "home", params: {} as Record<string, string> };
  }
}

function buildURL(page: string, params: Record<string, any>) {
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
function writeURL(page: string, params: Record<string, any>, { replace = false }: { replace?: boolean } = {}) {
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

export function NavigationProvider({ children }: { children: any }) {
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
      scrollAppToTop("auto");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // `options.replace`: true for URL-sync (e.g. auto-jump to latest summary);
  // default (false) pushes a new history entry so Back/Forward works.
  // `behavior: "auto"` is the spec value for an instant scroll; older code
  // used the non-standard "instant" alias which most browsers tolerate.
  // `options.scroll`: false to keep current scroll (e.g. opening a modal —
  // we don't want the page to jump while a dialog appears overlaid).
  const navigate = useCallback((p: string, nextParams: Record<string, any> = {}, options: { replace?: boolean; scroll?: boolean } = {}) => {
    setPage(p);
    setParams(nextParams || {});
    writeURL(p, nextParams || {}, { replace: !!options.replace });
    if (options.scroll !== false) scrollAppToTop("auto");
  }, []);

  // Merge a partial param patch into the current params, preserving the page.
  // Use for in-page state (e.g. opening a modal or switching a tab) where
  // we don't want to clobber sibling params. Pass null/undefined/"" to drop
  // a key. Defaults to { replace: false, scroll: false } since most in-page
  // updates are visual overlays where we want Back to undo, but no scroll.
  const setParamsPatch = useCallback(
    (patch: Record<string, any>, options: { replace?: boolean; scroll?: boolean } = {}) => {
      setParams((prev) => {
        const next: Record<string, any> = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") delete next[k];
          else next[k] = String(v);
        }
        setPage((curPage) => {
          writeURL(curPage, next, { replace: !!options.replace });
          return curPage;
        });
        if (options.scroll === true) {
          scrollAppToTop("auto");
        }
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ page, params, navigate, setParamsPatch }),
    [page, params, navigate, setParamsPatch],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
