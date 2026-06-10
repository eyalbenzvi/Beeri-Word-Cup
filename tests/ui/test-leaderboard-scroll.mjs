// Static-audit lock for the Leaderboard scroll behaviour:
//   1. NO auto-scroll on entry — the page must open at the top. The old
//      one-shot effect that yanked the viewport to the user's best-ranked
//      form was removed; this suite fails if anything similar comes back.
//   2. The manual jump chips ("הטפסים שלך") survive, and show from a
//      single form up (without auto-scroll they're the only fast path to
//      your own row).
//   3. A floating BackToTopButton exists with the accessibility /
//      responsiveness contract: aria-label, 44px tap target, reduced-motion
//      aware scrolling, passive + cleaned-up scroll listener, hysteresis
//      thresholds, safe-area + bottom-nav clearance for Android/iPhone,
//      desktop (xl) offset, and it is skipped in embedded admin preview.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LEADERBOARD SCROLL / BACK-TO-TOP TESTS ===\n");

const lb = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");
const btn = readMigratedSrc("src/components/BackToTopButton.jsx", "utf8");

// --- 1. No auto-scroll on entry -----------------------------------------

assert(
  !/autoScrolledRef/.test(lb),
  "auto-scroll one-shot ref is gone from Leaderboard",
);

// jumpToForm must only fire from event handlers, never from an effect.
// Strip every onClick={...} occurrence, then verify no jumpToForm call
// site remains (a useEffect-driven call would survive the strip).
const lbWithoutHandlers = lb.replace(/onClick=\{[^}]*\}/g, "");
assert(
  /jumpToForm/.test(lb),
  "jumpToForm still exists (manual jump preserved)",
);
assert(
  !/jumpToForm\(/.test(lbWithoutHandlers.replace(/const jumpToForm = \(/, "")),
  "jumpToForm is only called from onClick handlers, never from an effect",
);

// No scrollIntoView call inside any useEffect body in Leaderboard. The
// remaining scrolls are: jumpToForm (user-triggered) and the scroll-to-top
// when opening a form detail (window.scrollTo top:0 — allowed: it goes UP).
const effectBodies = lb.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\)/g) || [];
for (const body of effectBodies) {
  assert(
    !/scrollIntoView/.test(body),
    "no useEffect scrolls the page down to a row: " + body.slice(0, 60).replace(/\s+/g, " ") + "...",
  );
}
assert(effectBodies.length > 0, "useEffect-body extraction matched something (test not a no-op)");

// The only window.scrollTo in Leaderboard effects must target the top.
assert(
  !/window\.scrollTo\((?!\{ top: 0)/.test(lb),
  "any window.scrollTo in Leaderboard goes to the top of the page",
);

// --- 2. Manual jump chips show from one form up --------------------------

assert(
  /myForms\.length >= 1/.test(lb),
  "jump-chip strip renders from a single form up (>= 1, not > 1)",
);
assert(
  /הטופס שלך/.test(lb) && /הטפסים שלך/.test(lb),
  "chip strip label has singular + plural Hebrew variants",
);
assert(
  /preferredScrollBehavior\(\)/.test(lb),
  "manual jump respects prefers-reduced-motion via preferredScrollBehavior",
);

// --- 3. BackToTopButton contract -----------------------------------------

assert(
  /aria-label="חזרה לראש הדף"/.test(btn),
  "back-to-top has a Hebrew aria-label",
);
assert(
  /tap-44/.test(btn),
  "back-to-top enforces the 44px minimum touch target (brand book)",
);
assert(
  /preferredScrollBehavior\(\)/.test(btn),
  "back-to-top scroll respects prefers-reduced-motion",
);
assert(
  /\{ passive: true \}/.test(btn),
  "scroll listener is passive (no scroll jank on mobile)",
);
assert(
  /removeEventListener\("scroll"/.test(btn),
  "scroll listener is cleaned up on unmount",
);
assert(
  /requestAnimationFrame/.test(btn),
  "scroll handler is rAF-throttled",
);

// Hysteresis: the show threshold must be strictly above the hide threshold.
const showAt = Number((btn.match(/SHOW_AT_PX = (\d+)/) || [])[1]);
const hideAt = Number((btn.match(/HIDE_AT_PX = (\d+)/) || [])[1]);
assert(
  Number.isFinite(showAt) && Number.isFinite(hideAt) && showAt > hideAt,
  `show threshold (${showAt}) is above hide threshold (${hideAt}) — no flicker at the boundary`,
);

// Responsive placement: safe-area inset for notched iPhones / Android
// gesture bars, clearance above the 60px mobile bottom-nav, and a separate
// xl: offset for desktop where the bottom-nav doesn't exist.
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

// --- 4. Page wiring -------------------------------------------------------

assert(
  /import BackToTopButton from "\.\.\/components\/BackToTopButton"/.test(lb),
  "Leaderboard imports BackToTopButton",
);
assert(
  /\{!embedded && <BackToTopButton \/>\}/.test(lb),
  "BackToTopButton renders only outside embedded admin preview",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
