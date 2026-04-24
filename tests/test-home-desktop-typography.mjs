// Regression tests for Home + Welcome typography on desktop.
// Catches: oversized title (xl:text-5xl) that wraps awkwardly in the
// narrow xl middle column; CTA button that glues to the frame; and the
// broken 'עוד עד' countdown header.
import fs from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== HOME + WELCOME TYPOGRAPHY TESTS ===\n");

const home = fs.readFileSync("src/pages/Home.jsx", "utf8");
const welcome = fs.readFileSync("src/pages/WelcomeScreen.jsx", "utf8");
const messages = fs.readFileSync("src/constants/messages.js", "utf8");

// --- BRAND constant is the single source of truth for title copy ---
assert(/export const BRAND/.test(messages), "messages.js exports BRAND");
assert(
  /tournamentTitle:\s*"טורניר הניחושים של בארי"/.test(messages),
  "BRAND.tournamentTitle is canonical",
);
assert(
  /countdownHeader:\s*"הזמן שנותר לפתיחה"/.test(messages),
  "BRAND.countdownHeader uses natural Hebrew",
);

// --- Home: title no longer reaches text-5xl (too big for xl middle column) ---
assert(
  !/text-3xl\s+md:text-4xl\s+xl:text-5xl/.test(home),
  "Home h1 no longer uses xl:text-5xl",
);
assert(
  /text-balance/.test(home),
  "Home h1 uses text-balance for better line-wrap",
);
assert(
  /BRAND\.tournamentTitle/.test(home),
  "Home h1 consumes BRAND.tournamentTitle",
);

// --- Home: CTA has breathing room on desktop (max-w-[320px] + mx-auto) ---
assert(
  /md:max-w-\[320px\]/.test(home),
  "Home CTA caps width on md+ (md:max-w-[320px])",
);
assert(
  /md:mx-auto/.test(home) && /md:block/.test(home),
  "Home CTA centered on md+ (mx-auto + block)",
);

// --- Home: countdown header pulled from BRAND ---
assert(
  /BRAND\.countdownHeader/.test(home),
  "Home countdown header uses BRAND.countdownHeader",
);
assert(
  !/"עוד עד שריקת הפתיחה"/.test(home),
  "Home no longer contains broken 'עוד עד' string",
);

// --- WelcomeScreen: no two-column grid (single-column redesign) ---
assert(
  !/lg:grid-cols-\[minmax\(0,1fr\)_360px\]/.test(welcome),
  "WelcomeScreen drops the 1fr + 360px two-column grid",
);
assert(
  !/lg:order-last|lg:order-first/.test(welcome),
  "WelcomeScreen drops lg:order-* (no column ordering needed)",
);
assert(
  !/lg:h-dvh|lg:overflow-hidden/.test(welcome),
  "WelcomeScreen does not clip overflow on lg+ (scroll-safe)",
);

// --- WelcomeScreen: title uses BRAND + balance, never text-5xl ---
assert(
  /BRAND\.tournamentTitle/.test(welcome),
  "WelcomeScreen h1 consumes BRAND.tournamentTitle",
);
// Only check text-5xl on actual headings (h1/h2) — the ⚽🏆 emoji block
// is allowed to be text-5xl because it's decorative, not typographic.
const welcomeHeadings = welcome.match(/<h[12][^>]*>/g) || [];
assert(
  !welcomeHeadings.some((h) => /text-5xl/.test(h)),
  "WelcomeScreen h1/h2 no longer uses text-5xl",
);
assert(
  /text-balance/.test(welcome),
  "WelcomeScreen h1 uses text-balance",
);

// --- WelcomeScreen: countdown header pulled from BRAND ---
assert(
  /BRAND\.countdownHeader/.test(welcome),
  "WelcomeScreen countdown header uses BRAND.countdownHeader",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
