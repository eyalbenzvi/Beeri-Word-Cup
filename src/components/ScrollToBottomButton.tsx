import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

// Hide once the user has scrolled past this — beyond here BackToTopButton
// owns the same corner, and "down" is no longer the helpful direction.
const HIDE_BELOW_PX = 600;
// Re-show with hysteresis only after scrolling back up above this lower
// mark, so the button doesn't flicker when the scroll position hovers
// around a single threshold (matches BackToTopButton's approach).
const SHOW_ABOVE_PX = 400;
// Don't bother on a page that barely scrolls — if the content all but fits
// the viewport there's no meaningful "bottom" to jump to. Kept low (roughly
// a third of a phone screen) because the parent only mounts this button once
// there are more rows than the first page, so a real bottom always exists;
// this guard just suppresses the degenerate "everything visible" case.
const MIN_SCROLLABLE_PX = 300;
// Treat "within this many px of the bottom" as already there — nothing
// left to jump to, so the button hides.
const NEAR_BOTTOM_PX = 120;

/**
 * Floating "jump to bottom" button — the downward twin of BackToTopButton.
 * Surfaces a one-tap path to the end of a long ranked list (e.g. last place
 * in the leaderboard, which otherwise sits behind many "show more" taps).
 *
 * Visible ONLY near the top of a scrollable page: once the user scrolls
 * down, BackToTopButton takes over the identical bottom-left corner, so the
 * two are never on screen at the same time. The actual action (which may
 * need to expand a paginated list before scrolling) is supplied by the
 * parent via `onClick`.
 */
export default function ScrollToBottomButton({
  onClick,
}: {
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // rAF-throttled passive listener: scroll fires far more often than we
    // can paint; the functional setState is a no-op re-render when the
    // visibility didn't actually flip.
    let ticking = false;
    const evaluate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        const scrollable =
          document.documentElement.scrollHeight - window.innerHeight;
        const nearBottom = y >= scrollable - NEAR_BOTTOM_PX;
        if (scrollable < MIN_SCROLLABLE_PX || nearBottom) {
          setVisible(false);
          return;
        }
        // Show threshold sits BELOW the hide threshold (hysteresis): once
        // visible, stay visible until scrolled past HIDE_BELOW_PX; once
        // hidden, only re-show after climbing back above SHOW_ABOVE_PX.
        setVisible((v) => (v ? y < HIDE_BELOW_PX : y < SHOW_ABOVE_PX));
      });
    };
    evaluate(); // page may mount already scrolled (e.g. back-navigation restore)
    window.addEventListener("scroll", evaluate, { passive: true });
    // Content height changes (e.g. "show more" expanding the list, or a
    // viewport rotate) don't emit a scroll event — re-evaluate on resize so
    // the button correctly hides once the page is no longer scrollable.
    window.addEventListener("resize", evaluate, { passive: true });
    return () => {
      window.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="מעבר לתחתית הדירוג"
      // Same corner + z-order contract as BackToTopButton: z-40 sits below
      // the header/bottom-nav (z-50) and every overlay (z-[70]+); bottom
      // offset clears the 60px mobile bottom-nav plus safe-area on notched
      // devices; xl+ has no bottom-nav so a plain corner offset applies.
      className="tap-44 fixed z-40 left-4 xl:left-8 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] xl:bottom-8 w-11 h-11 rounded-full bg-white border-2 border-border shadow-lg text-ink-muted hover:text-ink hover:border-primary cursor-pointer inline-flex items-center justify-center animate-pop-in"
    >
      <ChevronDown size={22} aria-hidden="true" />
    </button>
  );
}
