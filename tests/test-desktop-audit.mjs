// Static audit: ensures legacy patterns are removed from the codebase.
// - No `dir="ltr"` on score pair spans (use <bdi> instead)
// - --color-ink-light has acceptable contrast on white (>=4.5:1)
// - Layout main has no max-w-4xl cap
// - Heebo font paired with Rubik in index.css
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== DESKTOP-DESIGN STATIC AUDIT ===\n");

// --- Score-pair dir=ltr: MatchCard / AllForms / UpcomingMatches should have none ---
const scorePairFiles = [
  "src/components/MatchCard.jsx",
  "src/pages/AllForms.jsx",
  "src/components/UpcomingMatches.jsx",
];
for (const f of scorePairFiles) {
  const src = fs.readFileSync(f, "utf8");
  // Look for pattern: dir="ltr">...\d\s*[-–]\s*\d
  const hasScorePair = /dir="ltr"[^>]*>\s*\{?[^}]*\d[^<]*[–-]\s*\{?[^}]*\d/.test(src);
  assert(!hasScorePair, `${f}: no dir=ltr on score pairs (uses <bdi>)`);
}

// --- --color-ink-light contrast on white ---
const cssSrc = fs.readFileSync("src/index.css", "utf8");
const inkLightMatch = cssSrc.match(/--color-ink-light:\s*#([0-9A-Fa-f]{6})/);
assert(inkLightMatch, "--color-ink-light is defined");
if (inkLightMatch) {
  const hex = inkLightMatch[1];
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // WCAG relative luminance
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  // Contrast vs white (1.0): (1 + 0.05) / (lum + 0.05)
  const contrast = 1.05 / (lum + 0.05);
  assert(contrast >= 4.5, `ink-light on white contrast >= 4.5:1 (got ${contrast.toFixed(2)}:1)`);
}

// --- Layout main has no max-w-4xl cap ---
const layoutSrc = fs.readFileSync("src/components/Layout.jsx", "utf8");
assert(!/<main[^>]*max-w-4xl/.test(layoutSrc), "main element is NOT capped at max-w-4xl");

// --- Heebo font paired in index.css ---
assert(/heebo/i.test(cssSrc), "Heebo font is loaded in index.css");
assert(/--font-heading/.test(cssSrc), "--font-heading token defined");

// --- PageHeader exists ---
assert(fs.existsSync("src/components/PageHeader.jsx"), "PageHeader.jsx exists");

// --- Beeri mascot exists ---
assert(fs.existsSync("src/components/Beeri.jsx"), "Beeri.jsx mascot exists");

// --- MatchdayHero exists ---
assert(fs.existsSync("src/components/MatchdayHero.jsx"), "MatchdayHero.jsx exists");

// --- DesktopSideNav exists ---
assert(fs.existsSync("src/components/DesktopSideNav.jsx"), "DesktopSideNav.jsx exists");

// --- Layout nav does NOT use emoji strings for primary nav items ---
// Nav items in Layout.jsx should reference lucide icons, not emoji keys
const emojiInNav = /emoji:\s*["'][🏠📋🏆⚽📊⚙️]["']/.test(layoutSrc);
assert(!emojiInNav, "Layout nav items do not use emoji-as-icon");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
