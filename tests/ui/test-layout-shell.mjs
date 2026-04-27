// Validates the App Shell structure: desktop sidebar on xl:, right-rail prop
// support, and mobile bottom-nav preservation.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LAYOUT SHELL TESTS ===\n");

const layoutSrc = fs.readFileSync("src/components/Layout.jsx", "utf8");

// --- Layout accepts rightRail prop ---
assert(/rightRail/.test(layoutSrc), "Layout accepts rightRail prop");

// --- Desktop sidebar component is imported ---
assert(/DesktopSideNav/.test(layoutSrc), "Layout imports DesktopSideNav");

// --- xl: grid class present ---
assert(/xl:grid/.test(layoutSrc), "Layout uses xl:grid for multi-column shell");

// --- Main container no longer capped at max-w-4xl ---
assert(!/<main[^>]*max-w-4xl/.test(layoutSrc), "main element is NOT capped at max-w-4xl");

// --- Hamburger hidden on xl: ---
assert(/xl:hidden/.test(layoutSrc), "xl:hidden applied somewhere (hamburger + top tabs)");

// --- Bottom-nav gated xl:hidden (available on mobile + tablet, hidden on desktop) ---
assert(
  /xl:hidden/.test(layoutSrc) && /fixed bottom-0/.test(layoutSrc),
  "bottom-nav present and gated xl:hidden (shown on mobile+tablet, replaced by side nav on xl)"
);

// --- DesktopSideNav component exists ---
const sideNavPath = "src/components/DesktopSideNav.jsx";
assert(fs.existsSync(sideNavPath), "DesktopSideNav.jsx file exists");

if (fs.existsSync(sideNavPath)) {
  const sideNavSrc = fs.readFileSync(sideNavPath, "utf8");
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
