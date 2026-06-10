import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { preferredScrollBehavior } from "../utils/helpers";

// Appear only after the user has scrolled roughly a phone viewport down —
// at the top of the page the button is dead weight that covers content.
const SHOW_AT_PX = 600;
// Hide at a LOWER offset than we show at (hysteresis): with a single
// threshold the button flickers in/out when the scroll position hovers
// around it, especially with iOS momentum scrolling.
const HIDE_AT_PX = 400;

/**
 * Floating "back to top" button. Fixed to the bottom-left corner (RTL
 * layout keeps row-leading content on the right, so the left corner covers
 * the least), raised above the mobile bottom-nav (~60px + safe-area) and
 * dropped to a plain corner offset on xl+ where the side nav replaces it.
 */
export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // rAF-throttled passive listener: scroll fires far more often than we
    // can paint; the functional setState is a no-op re-render when the
    // visibility didn't actually flip.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        setVisible((v) => (v ? y > HIDE_AT_PX : y > SHOW_AT_PX));
      });
    };
    onScroll(); // page may mount already scrolled (e.g. back-navigation restore)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
      }
      aria-label="חזרה לראש הדף"
      // z-40 sits below the header/bottom-nav (z-50) and every overlay
      // (z-[70]+) so the button never floats above a drawer or modal.
      // bottom offset = safe-area + 5rem clears the 60px bottom-nav plus a
      // margin on notched iPhones/Android gesture bars; xl+ has no bottom
      // nav so a plain 2rem corner offset applies.
      className="tap-44 fixed z-40 left-4 xl:left-8 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] xl:bottom-8 w-11 h-11 rounded-full bg-white border-2 border-border shadow-lg text-ink-muted hover:text-ink hover:border-primary cursor-pointer inline-flex items-center justify-center animate-pop-in"
    >
      <ChevronUp size={22} aria-hidden="true" />
    </button>
  );
}
