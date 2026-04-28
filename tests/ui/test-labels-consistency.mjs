// Regression lock on the canonical Hebrew labels introduced to eliminate
// the historical drift: "מלך שערים" vs "מלך השערים", "מדויקים" vs "מדויקות".
// Once a noun is centralised in LABELS, touching it in a single place updates
// every surface (cards, leaderboard rows, CSV export, admin screens).
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== LABELS CONSISTENCY TESTS ===\n");

const messages = readMigratedSrc("src/constants/messages.js", "utf8");

// --- 1. LABELS shape and canonical values ---
assert(/export const LABELS/.test(messages), "messages.js exports LABELS");
assert(
  /topScorer:\s*TOP_SCORER/.test(messages) || /topScorer:\s*"מלך השערים"/.test(messages),
  "LABELS.topScorer canonical value is 'מלך השערים' (definite form)",
);
assert(
  /const TOP_SCORER = "מלך השערים"/.test(messages) ||
    /topScorer:\s*"מלך השערים"/.test(messages),
  "Canonical top-scorer string is defined once",
);
assert(
  /exactCount:\s*"מדויקים"/.test(messages),
  "LABELS.exactCount canonical value is 'מדויקים' (masculine)",
);
assert(
  /outcomeCount:\s*"הכרעות"/.test(messages),
  "LABELS.outcomeCount defined",
);
assert(
  /champion:\s*CHAMPION/.test(messages) || /champion:\s*"אלופה"/.test(messages),
  "LABELS.champion defined",
);

// --- 2. Consumers that display the top-scorer label pull it from LABELS ---
const consumers = [
  "src/components/ReviewScreen.jsx",
  "src/components/FormDetailsTab.jsx",
  "src/components/ScoringTable.jsx",
  "src/components/AdminFormsTab.jsx",
  "src/components/AdminToolsTab.jsx",
  "src/pages/Leaderboard.jsx",
  "src/pages/Profile.jsx",
  "src/pages/AllForms.jsx",
];
for (const file of consumers) {
  const src = readMigratedSrc(file, "utf8");
  assert(
    /from ["']\.\.\/constants\/messages["']/.test(src) ||
      /from ["']\.\.\/\.\.\/constants\/messages["']/.test(src),
    `${file}: imports from constants/messages`,
  );
  assert(/LABELS/.test(src), `${file}: uses LABELS`);
}

// --- 3. "מדויקות" (feminine) must not appear as a user-facing string ---
const filesThatOnceHadWrongGender = [
  "src/pages/Leaderboard.jsx",
  "src/pages/Profile.jsx",
];
for (const file of filesThatOnceHadWrongGender) {
  const src = readMigratedSrc(file, "utf8");
  assert(!/מדויקות/.test(src), `${file}: no stale 'מדויקות' string`);
}

// --- 4. No literal "מלך שערים" (indefinite) in user-facing surfaces we
// migrated. Narrative copy in MenuOverlay/validation/comments/toasts is
// intentionally excluded. ---
const definiteOnly = [
  "src/pages/Leaderboard.jsx",
  "src/pages/AllForms.jsx",
  "src/pages/Profile.jsx",
  "src/components/FormList.jsx",
  "src/components/ReviewScreen.jsx",
  "src/components/FormDetailsTab.jsx",
  "src/components/ScoringTable.jsx",
  "src/components/AdminFormsTab.jsx",
  "src/components/AdminToolsTab.jsx",
];
for (const file of definiteOnly) {
  const src = readMigratedSrc(file, "utf8");
  // Allow the definite form "מלך השערים" but catch the indefinite "מלך שערים"
  // (not followed by ה).
  assert(
    !/מלך שערים[^ה]/.test(src),
    `${file}: no literal 'מלך שערים' (use LABELS.topScorer)`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
