// The form-row entity (avatar + name + champion + top scorer) had four
// divergent visual variants across FormList/AllForms/Leaderboard/Profile.
// After consolidation it is rendered via FormAvatar + FormSummaryLines in
// every place. This test locks that contract: every form-row surface imports
// the shared components and no page re-implements the avatar/summary markup.
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== FORM ROW CONSISTENCY TESTS ===\n");

// --- 1. Shared components exist with the expected public API ---
const avatar = readMigratedSrc("src/components/FormAvatar.jsx", "utf8");
assert(/export default function FormAvatar/.test(avatar), "FormAvatar is default-exported");
assert(/size\s*=\s*"md"/.test(avatar), "FormAvatar accepts a size prop defaulting to md");
assert(/normalizeStatus/.test(avatar), "FormAvatar reads submitted status via normalizeStatus");
assert(/aria-label/.test(avatar), "FormAvatar exposes an aria-label for the avatar circle");

const summary = readMigratedSrc("src/components/FormSummaryLines.jsx", "utf8");
assert(/export default function FormSummaryLines/.test(summary), "FormSummaryLines is default-exported");
assert(/championName/.test(summary) && /topScorerName/.test(summary), "FormSummaryLines accepts championName + topScorerName props");
assert(/🏆/.test(summary) && /⚽/.test(summary), "FormSummaryLines emits the canonical icons");
assert(/LABELS\.championAria/.test(summary), "FormSummaryLines uses LABELS.championAria for aria-label");
assert(/LABELS\.topScorerAria/.test(summary), "FormSummaryLines uses LABELS.topScorerAria for aria-label");

// --- 2. Every form-row surface imports the shared components ---
const surfaces = [
  "src/components/FormList.jsx",
  "src/pages/AllForms.jsx",
  "src/pages/Leaderboard.jsx",
  "src/pages/Profile.jsx",
];
for (const file of surfaces) {
  const src = readMigratedSrc(file, "utf8");
  assert(/FormAvatar/.test(src), `${file}: imports/uses FormAvatar`);
  assert(/FormSummaryLines/.test(src), `${file}: imports/uses FormSummaryLines`);
}

// --- 3. Obsolete per-page avatar patterns are gone ---
{
  // FormList previously used "✓" / "📋" as avatar content.
  const src = readMigratedSrc("src/components/FormList.jsx", "utf8");
  assert(
    !/formStatus === "submitted" \? "✓" : "📋"/.test(src),
    "FormList no longer builds its own ✓/📋 avatar inline",
  );
}
{
  // Leaderboard previously rendered an inline 📋 icon before the form name
  // AND a user-initial circle. Both should be gone.
  const src = readMigratedSrc("src/pages/Leaderboard.jsx", "utf8");
  assert(
    !/<span className="ml-1">📋<\/span>/.test(src),
    "Leaderboard row no longer prefixes formName with inline 📋",
  );
}

// --- 4. Champion display is derived, never stored, across all surfaces ---
for (const file of ["src/components/FormList.jsx", "src/pages/AllForms.jsx", "src/pages/Profile.jsx"]) {
  const src = readMigratedSrc(file, "utf8");
  assert(
    /getCachedChampion\(/.test(src),
    `${file}: derives champion via getCachedChampion`,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
