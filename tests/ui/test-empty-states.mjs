// Ensures Profile, Stats, and AllForms all render a consistent EmptyState
// when their primary data is missing (avoids blank panels).
import fs from "node:fs";
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== EMPTY STATES TESTS ===\n");

const profile = readMigratedSrc("src/pages/Profile.jsx", "utf8");
const stats = readMigratedSrc("src/pages/Stats.jsx", "utf8");
const allForms = readMigratedSrc("src/pages/AllForms.jsx", "utf8");

// --- Profile imports and uses EmptyState for forms.length === 0 ---
assert(/import EmptyState/.test(profile), "Profile imports EmptyState");
assert(
  /forms\.length === 0[\s\S]{0,400}<EmptyState/.test(profile),
  "Profile renders EmptyState when forms.length === 0",
);

// --- Stats uses EmptyState for no submitted forms ---
assert(/import EmptyState/.test(stats), "Stats imports EmptyState");
assert(
  /submittedForms\.length === 0[\s\S]{0,200}<EmptyState/.test(stats),
  "Stats renders EmptyState when no submitted forms",
);

// --- AllForms uses EmptyState for no submitted forms + no filter matches ---
assert(/import EmptyState/.test(allForms), "AllForms imports EmptyState");
const emptyStateUsage = (allForms.match(/<EmptyState/g) || []).length;
assert(
  emptyStateUsage >= 2,
  `AllForms uses EmptyState at least twice (submitted empty + filter empty) — found ${emptyStateUsage}`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
