// Frozen header + footer (app-shell / inner-scroll) regression suite.
//
// Bug: on Android Chrome the document/body was the scroll container, so the
// dynamic URL bar collapsed mid-scroll — clipping the sticky header to half
// height (content scrolling under it) and, with no viewport-fit=cover, hiding
// the bottom-nav labels behind the gesture bar.
//
// Fix: the app lives in a fixed-height (100dvh) flex column whose only scroll
// container is #app-scroll. The header + bottom-nav are frozen flex children
// OUTSIDE the scroller, so the root never scrolls, the URL bar never
// collapses, and the chrome stays put on every platform. Safe-area padding
// (viewport-fit=cover) keeps the chrome clear of the notch / gesture bar.
//
// These are static-source assertions guarding the structure so a future edit
// can't silently regress back to body-scroll.
import fs from "node:fs";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== FROZEN CHROME (app-shell / inner-scroll) TESTS ===\n");

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const css = readMigratedSrc("src/index.css");
const layout = readMigratedSrc("src/components/Layout.jsx");
const sideNav = readMigratedSrc("src/components/DesktopSideNav.jsx");
const predict = readMigratedSrc("src/pages/Predict.jsx");
const formList = readMigratedSrc("src/components/FormList.jsx");
const backTop = readMigratedSrc("src/components/BackToTopButton.jsx");
const toBottom = readMigratedSrc("src/components/ScrollToBottomButton.jsx");
const nav = readMigratedSrc("src/hooks/useNavigation.jsx");
const leaderboard = readMigratedSrc("src/pages/Leaderboard.jsx");

// ---------- Phase 1: viewport meta exposes safe-area insets ----------
console.log("--- Phase 1: viewport-fit=cover ---");
assert(/viewport-fit=cover/.test(html), "index.html viewport meta sets viewport-fit=cover (enables env(safe-area-inset-*))");
// The shell is 100dvh/overflow:hidden, so the soft keyboard must shrink the
// layout viewport instead of overlaying the bottom-of-form inputs.
assert(/interactive-widget=resizes-content/.test(html), "index.html viewport meta sets interactive-widget=resizes-content (keyboard shrinks the shell)");

// ---------- Phase 2: CSS app-shell + locked document ----------
console.log("--- Phase 2: app-shell CSS ---");
assert(/\.app-shell\s*\{[^}]*display:\s*flex/.test(css), ".app-shell is a flex container");
assert(/\.app-shell\s*\{[^}]*flex-direction:\s*column/.test(css), ".app-shell is a column");
assert(/\.app-shell\s*\{[^}]*height:\s*100dvh/.test(css), ".app-shell height is 100dvh (dynamic viewport)");
assert(/\.app-shell\s*\{[^}]*height:\s*100vh/.test(css), ".app-shell keeps a 100vh fallback before 100dvh");
assert(/\.app-shell\s*\{[^}]*overflow:\s*hidden/.test(css), ".app-shell itself never scrolls (overflow:hidden)");
assert(/\.app-scroll\s*\{[^}]*min-height:\s*0/.test(css), ".app-scroll has min-height:0 (so the flex child can shrink + scroll)");
assert(/\.app-scroll\s*\{[^}]*overflow-y:\s*auto/.test(css), ".app-scroll scrolls vertically");
assert(/\.app-scroll\s*\{[^}]*overscroll-behavior:\s*contain/.test(css), ".app-scroll contains overscroll (no chaining into the body)");
assert(/body[^{]*\{[^}]*overscroll-behavior:\s*none/.test(css) || /html,\s*body\s*\{[^}]*overscroll-behavior:\s*none/.test(css), "document overscroll-behavior:none (no rubber-band detaching the chrome)");
assert(/#root\s*\{[^}]*height:\s*100%/.test(css), "#root fills its height");
// .app-shell/.app-scroll must NOT establish a containing block for fixed
// descendants, or modals/overlays would be clipped by the shell.
assert(!/\.app-(shell|scroll)\s*\{[^}]*(transform|filter|perspective)\s*:/.test(css), ".app-shell/.app-scroll add no transform/filter/perspective (fixed overlays still escape to the viewport)");

// ---------- Phase 3: safe-area utilities ----------
console.log("--- Phase 3: safe-area utilities ---");
assert(/\.safe-area-top\s*\{[^}]*env\(safe-area-inset-top\)/.test(css), ".safe-area-top utility defined");
assert(/\.safe-area-x\s*\{[^}]*env\(safe-area-inset-left\)/.test(css), ".safe-area-x pads the left inset");
assert(/\.safe-area-x\s*\{[^}]*env\(safe-area-inset-right\)/.test(css), ".safe-area-x pads the right inset");

// ---------- Phase 4: Layout structure ----------
console.log("--- Phase 4: Layout app-shell wiring ---");
assert(/className="app-shell/.test(layout), "Layout root uses .app-shell");
assert(/id="app-scroll"/.test(layout) && /className="app-scroll"/.test(layout), "Layout renders the single #app-scroll container");
// The single top safe-area inset lives on the shell, above whichever element
// is first (OfflineBanner when offline, else the header) — no double padding.
assert(/className="app-shell[^"]*safe-area-top/.test(layout), "app-shell pads the top safe-area (covers OfflineBanner + header)");
// Header is now a frozen flex child, NOT sticky/fixed.
assert(/<header[^>]*flex-shrink-0/.test(layout), "header is a frozen flex child (flex-shrink-0)");
assert(!/<header[^>]*sticky/.test(layout), "header is NOT position:sticky anymore");
assert(!/<header[^>]*\bfixed\b/.test(layout), "header is NOT position:fixed");
// Bottom nav frozen, not fixed.
assert(!/<nav[^>]*fixed bottom-0/.test(layout), "bottom-nav is NOT fixed bottom-0 anymore");
assert(/<nav[^>]*flex-shrink-0/.test(layout) && /<nav[^>]*safe-area-bottom/.test(layout), "bottom-nav is a frozen flex child padding the bottom safe-area");
// The old fixed-nav clearance padding must be gone (nav now occupies layout
// space, so content no longer needs pb-24 to clear it).
assert(!/pb-24/.test(layout), "content wrapper drops pb-24 (nav no longer overlaps content)");
assert(!/min-h-\[calc\(100vh-4rem\)\]/.test(layout), "content wrapper drops the 100vh min-height hack");

// ---------- Phase 5: appScroll helper centralises scroll access ----------
console.log("--- Phase 5: appScroll helper ---");
assert(existsMigratedSrc("src/utils/appScroll.js"), "src/utils/appScroll.ts exists");
const appScroll = readMigratedSrc("src/utils/appScroll.js");
assert(/APP_SCROLL_ID\s*=\s*["']app-scroll["']/.test(appScroll), "APP_SCROLL_ID === 'app-scroll' (matches Layout id)");
for (const fn of ["getAppScrollEl", "getAppScrollTop", "getAppScrollMetrics", "scrollAppToTop", "onAppScroll"]) {
  assert(new RegExp(`export function ${fn}`).test(appScroll), `appScroll exports ${fn}()`);
}
// Window fallback for out-of-Layout states (Loading / ProfileSetup) and tests.
assert(/window\.scrollY/.test(appScroll) && /window\.scrollTo/.test(appScroll), "appScroll falls back to window when #app-scroll is absent");

// ---------- Phase 6: consumers route through appScroll ----------
console.log("--- Phase 6: scroll consumers ---");
// BackToTopButton
assert(/getAppScrollTop|onAppScroll|scrollAppToTop/.test(backTop), "BackToTopButton uses appScroll helpers");
assert(!/window\.scrollY/.test(backTop), "BackToTopButton no longer reads window.scrollY");
assert(!/window\.addEventListener\(\s*["']scroll/.test(backTop), "BackToTopButton no longer listens on window scroll (events don't bubble from #app-scroll)");
// ScrollToBottomButton
assert(/getAppScrollMetrics/.test(toBottom), "ScrollToBottomButton uses getAppScrollMetrics");
assert(!/window\.scrollY/.test(toBottom) && !/document\.documentElement\.scrollHeight/.test(toBottom), "ScrollToBottomButton no longer reads window/document scroll metrics");
assert(!/window\.addEventListener\(\s*["']scroll/.test(toBottom), "ScrollToBottomButton no longer listens on window scroll");
// useNavigation + Leaderboard
assert(/scrollAppToTop/.test(nav), "useNavigation uses scrollAppToTop");
assert(!/window\.scrollTo/.test(nav), "useNavigation no longer calls window.scrollTo");
assert(/scrollAppToTop/.test(leaderboard) && !/window\.scrollTo/.test(leaderboard), "Leaderboard uses scrollAppToTop, not window.scrollTo");

// ---------- Phase 7: in-page sticky offsets re-based to the scroll top ----------
console.log("--- Phase 7: sticky sub-bars rebased to top-0 ---");
assert(/sticky\s+top-0/.test(predict) && !/sticky\s+top-16/.test(predict), "Predict stage/group bar sticks at top-0 (under the frozen header)");
assert(/sticky\s+top-0/.test(formList) && !/sticky\s+top-16/.test(formList), "FormList header sticks at top-0");
assert(!/xl:top-\[5\.5rem\]/.test(sideNav) && /xl:top-4/.test(sideNav), "DesktopSideNav sticky offset rebased to xl:top-4");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
