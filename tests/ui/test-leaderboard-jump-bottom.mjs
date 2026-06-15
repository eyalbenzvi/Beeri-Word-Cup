// Static-audit lock for the Leaderboard "jump to bottom" UX. The ranked
// list paginates 20 rows at a time, so reaching last place used to require
// many "show more" taps. Two convenient paths were added:
//   1. A floating ScrollToBottomButton (downward twin of BackToTopButton)
//      that reveals the full list and scrolls the last row into view.
//   2. An inline "show all" button beside "show more" that loads the whole
//      remaining list in one tap.
// This suite locks both the component contract and the page wiring so a
// regression that removes either path, or that reintroduces a downward
// auto-scroll from an effect, is caught at static-audit time.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LEADERBOARD JUMP-TO-BOTTOM TESTS ===\n");

const lb = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");
const btn = readMigratedSrc("src/components/ScrollToBottomButton.jsx", "utf8");

// --- 1. ScrollToBottomButton component contract --------------------------

assert(
  /aria-label="מעבר לתחתית הדירוג"/.test(btn),
  "jump-to-bottom has a Hebrew aria-label",
);
assert(
  /tap-44/.test(btn),
  "jump-to-bottom enforces the 44px minimum touch target (brand book)",
);
assert(
  /ChevronDown/.test(btn),
  "jump-to-bottom uses a downward chevron (mirror of back-to-top)",
);
assert(
  /\{ passive: true \}/.test(btn),
  "scroll listener is passive (no scroll jank on mobile)",
);
assert(
  /removeEventListener\("scroll"/.test(btn) && /removeEventListener\("resize"/.test(btn),
  "scroll + resize listeners are both cleaned up on unmount",
);
assert(
  /addEventListener\("resize"/.test(btn),
  "listens on resize too — 'show more' growing the list emits no scroll event",
);
assert(
  /requestAnimationFrame/.test(btn),
  "scroll handler is rAF-throttled",
);

// Hysteresis: for a near-top button the SHOW threshold sits BELOW the HIDE
// threshold, so it doesn't flicker when the scroll position hovers around a
// single mark.
const showAbove = Number((btn.match(/SHOW_ABOVE_PX = (\d+)/) || [])[1]);
const hideBelow = Number((btn.match(/HIDE_BELOW_PX = (\d+)/) || [])[1]);
assert(
  Number.isFinite(showAbove) && Number.isFinite(hideBelow) && showAbove < hideBelow,
  `show threshold (${showAbove}) is below hide threshold (${hideBelow}) — no flicker at the boundary`,
);

// Don't show on a barely-scrollable page, and hide once near the bottom.
assert(
  /MIN_SCROLLABLE_PX/.test(btn),
  "button stays hidden on a page that barely scrolls (no real bottom to jump to)",
);
assert(
  /nearBottom/.test(btn),
  "button hides once the user is already near the bottom",
);

// Same responsive placement contract as BackToTopButton so the two share
// the corner cleanly and never collide visually.
assert(
  /safe-area-inset-bottom/.test(btn),
  "bottom offset accounts for env(safe-area-inset-bottom)",
);
assert(
  /xl:bottom-/.test(btn) && /xl:left-/.test(btn),
  "desktop (xl) gets its own corner offsets (no bottom-nav to clear)",
);
assert(
  /z-40/.test(btn),
  "button sits below header/bottom-nav (z-50) and overlays (z-[70]+)",
);

// The action is parent-supplied (it must expand the paginated list before
// scrolling), so the component itself only wires an onClick prop.
assert(
  /onClick=\{onClick\}/.test(btn) && /\{\s*onClick\s*\}/.test(btn),
  "action is delegated to the parent via an onClick prop",
);

// --- 2. jumpToBottom handler in Leaderboard ------------------------------

assert(
  /const jumpToBottom = \(\) => \{/.test(lb),
  "Leaderboard defines a jumpToBottom handler",
);
// It must reveal the whole list (defeating pagination) before scrolling.
assert(
  /setShowCount\((displayed|filtered)Leaderboard\.length\)/.test(lb),
  "jumpToBottom expands showCount to the full (displayed) list length",
);
assert(
  /preferredScrollBehavior\(\)/.test(lb),
  "jumpToBottom respects prefers-reduced-motion via preferredScrollBehavior",
);

// jumpToBottom (like jumpToForm) must only fire from an event handler, never
// from an effect. Strip every onClick={...}, then confirm no call site
// survives (a useEffect-driven call would).
const lbWithoutHandlers = lb.replace(/onClick=\{[^}]*\}/g, "");
assert(
  !/jumpToBottom\(/.test(lbWithoutHandlers.replace(/const jumpToBottom = \(/, "")),
  "jumpToBottom is only called from an onClick handler, never from an effect",
);

// No new downward window.scrollTo crept in — every window.scrollTo in the
// page must still target the top (the form-detail scroll-to-top). The
// downward jump uses scrollIntoView on the last row, not a raw scrollTo.
assert(
  !/window\.scrollTo\((?!\{ top: 0)/.test(lb),
  "no window.scrollTo in Leaderboard scrolls anywhere but the top",
);

// --- 3. Page wiring ------------------------------------------------------

assert(
  /import ScrollToBottomButton from "\.\.\/components\/ScrollToBottomButton"/.test(lb),
  "Leaderboard imports ScrollToBottomButton",
);
// Floating button only on the list view (not the form detail), not in the
// embedded admin preview, and only when the list is actually paginated.
assert(
  /!embedded && !selectedForm && displayedLeaderboard\.length > PAGE_SIZE && \(\s*<ScrollToBottomButton onClick=\{jumpToBottom\} \/>/.test(lb),
  "ScrollToBottomButton renders only on the paginated list view (not embedded, not form detail)",
);

// --- 4. Inline "show all" button -----------------------------------------

assert(
  /setShowCount\(displayedLeaderboard\.length\)/.test(lb),
  "an inline button loads the entire list in one tap (setShowCount to full length)",
);
assert(
  /הצג את כולם/.test(lb),
  "inline 'show all' button has Hebrew copy",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
