// Validates the App Shell structure: desktop sidebar on xl:, right-rail prop
// support, and mobile bottom-nav preservation.
import fs from "node:fs";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LAYOUT SHELL TESTS ===\n");

const layoutSrc = readMigratedSrc("src/components/Layout.jsx", "utf8");

// --- Layout accepts rightRail prop ---
assert(/rightRail/.test(layoutSrc), "Layout accepts rightRail prop");

// --- Connectivity banner is mounted app-wide ---
assert(/import OfflineBanner/.test(layoutSrc), "Layout imports OfflineBanner");
assert(/<OfflineBanner\s*\/>/.test(layoutSrc), "Layout renders <OfflineBanner />");

// --- Desktop sidebar component is imported ---
assert(/DesktopSideNav/.test(layoutSrc), "Layout imports DesktopSideNav");

// --- xl: grid class present ---
assert(/xl:grid/.test(layoutSrc), "Layout uses xl:grid for multi-column shell");

// --- Main container no longer capped at max-w-4xl ---
assert(!/<main[^>]*max-w-4xl/.test(layoutSrc), "main element is NOT capped at max-w-4xl");

// --- Hamburger hidden on xl: ---
assert(/xl:hidden/.test(layoutSrc), "xl:hidden applied somewhere (hamburger + top tabs)");

// --- Bottom-nav gated xl:hidden (available on mobile + tablet, hidden on desktop) ---
// The nav is now a FROZEN flex child of the app shell (not position:fixed): it
// sits outside #app-scroll so the mobile URL bar can't push it behind the
// gesture bar. It must still be gated xl:hidden and pad the bottom safe-area.
assert(
  /<nav[^>]*xl:hidden/.test(layoutSrc) && /<nav[^>]*flex-shrink-0/.test(layoutSrc),
  "bottom-nav present, gated xl:hidden, and a frozen flex child (flex-shrink-0)"
);
assert(
  /<nav[^>]*safe-area-bottom/.test(layoutSrc),
  "bottom-nav pads the bottom safe-area (clears the gesture bar)"
);

// --- DesktopSideNav component exists ---
const sideNavPath = "src/components/DesktopSideNav.jsx";
assert(existsMigratedSrc(sideNavPath), "DesktopSideNav.jsx file exists");

if (existsMigratedSrc(sideNavPath)) {
  const sideNavSrc = readMigratedSrc(sideNavPath, "utf8");
  // Uses lucide icons, not emoji
  assert(/from ["']lucide-react["']/.test(sideNavSrc), "DesktopSideNav imports from lucide-react");
  // Has aria-label on nav items
  assert(/aria-label|aria-current/.test(sideNavSrc), "DesktopSideNav has ARIA attributes");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
