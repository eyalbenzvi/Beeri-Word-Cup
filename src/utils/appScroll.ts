// Single source of truth for "the app's scroll container".
//
// The app shell (see Layout) keeps the document/body non-scrolling and routes
// all scrolling through one inner element, `#app-scroll`. This is what frees
// the header/footer to stay frozen across platforms (the browser's dynamic
// toolbar never collapses because the root never scrolls). The trade-off is
// that `window.scrollY` / `window.scrollTo` / scroll events no longer reflect
// app scrolling — they must target the container instead.
//
// Every former `window.scroll*` consumer goes through the helpers below. Each
// falls back to the window/document when the container isn't present, so:
//   • states rendered OUTSIDE Layout (Loading, ProfileSetup, ErrorBoundary)
//     still scroll the document normally, and
//   • SSR / jsdom / unit tests don't crash on a missing element.
//
// Note: a scroll event on the container does NOT bubble to `window`, so any
// code that previously did `window.addEventListener("scroll", …)` MUST use
// `onAppScroll` here, or it will silently never fire.

export const APP_SCROLL_ID = "app-scroll";

export function getAppScrollEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(APP_SCROLL_ID);
}

/** Current vertical scroll offset of the app (container, else window). */
export function getAppScrollTop(): number {
  const el = getAppScrollEl();
  if (el) return el.scrollTop;
  if (typeof window === "undefined") return 0;
  return window.scrollY || 0;
}

/** scrollTop / scrollHeight / clientHeight for "is near bottom" math. */
export function getAppScrollMetrics(): {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
} {
  const el = getAppScrollEl();
  if (el) {
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  }
  return {
    scrollTop: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: window.innerHeight,
  };
}

/** Scroll the app back to the top (container, else window). */
export function scrollAppToTop(behavior: ScrollBehavior = "auto"): void {
  // Best-effort, like the window.scrollTo it replaced: very old engines may
  // lack the options-object form of scrollTo and throw — a failed scroll
  // reset must never break navigation.
  try {
    const el = getAppScrollEl();
    if (el) {
      el.scrollTo({ top: 0, behavior });
      return;
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior });
  } catch {
    /* noop — best-effort */
  }
}

/**
 * Subscribe to app scroll (container, else window). Optionally also fire on
 * window `resize` (content-height changes that don't emit a scroll event).
 * Returns an unsubscribe function. The listener target is resolved once, at
 * subscribe time — `#app-scroll` is mounted for the whole app lifetime, so by
 * the time a child effect runs the element already exists in the DOM.
 */
export function onAppScroll(
  handler: () => void,
  opts: { resize?: boolean } = {},
): () => void {
  const el = getAppScrollEl();
  const target: HTMLElement | Window | null =
    el || (typeof window !== "undefined" ? window : null);
  if (!target) return () => {};
  target.addEventListener("scroll", handler, { passive: true });
  if (opts.resize && typeof window !== "undefined") {
    window.addEventListener("resize", handler, { passive: true });
  }
  return () => {
    target.removeEventListener("scroll", handler);
    if (opts.resize && typeof window !== "undefined") {
      window.removeEventListener("resize", handler);
    }
  };
}
