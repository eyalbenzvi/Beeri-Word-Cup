// Tests for src/utils/formNameGenerator.js — the auto-populate form-name rule.
// Usage: node --loader ./tests/loader.mjs tests/test-form-name-default.mjs

import {
  generateDefaultFormName,
  DEFAULT_FORM_NAME_FALLBACK,
} from "../../src/utils/formNameGenerator.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

let passed = 0,
  failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error("  FAIL: " + msg);
  }
}
function eq(a, b, msg) {
  assert(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log("=== FORM NAME GENERATOR ===\n");

// ============ 1. First form uses nickname verbatim ============
console.log("--- 1. First form uses nickname verbatim ---");
eq(
  generateDefaultFormName({ nickname: "שלומי" }),
  "שלומי",
  "No existing forms → nickname",
);
eq(
  generateDefaultFormName({ nickname: "Alice", userForms: [], allPredictions: {} }),
  "Alice",
  "Empty arrays → nickname",
);

// ============ 2. Second form bumps to 'nickname 2' ============
console.log("--- 2. Second form bumps to suffix 2 ---");
eq(
  generateDefaultFormName({
    nickname: "שלומי",
    userForms: [{ formName: "שלומי", status: "draft" }],
  }),
  "שלומי 2",
  "One existing draft → suffix 2",
);
eq(
  generateDefaultFormName({
    nickname: "שלומי",
    userForms: [
      { formName: "שלומי", status: "submitted" },
      { formName: "שלומי 2", status: "draft" },
    ],
  }),
  "שלומי 3",
  "Two existing → suffix 3",
);

// ============ 3. Fills the smallest unused gap ============
console.log("--- 3. Fills smallest unused gap ---");
eq(
  generateDefaultFormName({
    nickname: "שלומי",
    userForms: [
      { formName: "שלומי", status: "draft" },
      { formName: "שלומי 3", status: "draft" },
    ],
  }),
  "שלומי 2",
  "Gap at 2 is filled before 4",
);
eq(
  generateDefaultFormName({
    nickname: "שלומי",
    userForms: [
      { formName: "שלומי 3", status: "draft" },
      { formName: "שלומי 5", status: "draft" },
    ],
  }),
  "שלומי",
  "No base exists → returns base without suffix",
);

// ============ 4. Cross-user submitted/pending/approved collisions ============
console.log("--- 4. Cross-user collisions for blocking statuses ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [],
    allPredictions: {
      otherA: { formName: "Alice", status: "submitted" },
    },
  }),
  "Alice 2",
  "Cross-user submitted form blocks base",
);
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [],
    allPredictions: {
      otherP: { formName: "Alice", status: "pending" },
    },
  }),
  "Alice 2",
  "Cross-user pending form blocks base",
);
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [],
    allPredictions: {
      otherA: { formName: "Alice", status: "approved" },
    },
  }),
  "Alice 2",
  "Cross-user approved form blocks base",
);

// ============ 5. Cross-user drafts DO NOT block (only user's own do) ============
console.log("--- 5. Cross-user drafts are ignored ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [],
    allPredictions: {
      otherDraft: { formName: "Alice", status: "draft" },
    },
  }),
  "Alice",
  "Cross-user draft does not block (safe: drafts aren't submitted yet)",
);

// ============ 6. Case-insensitive ============
console.log("--- 6. Case-insensitive matching ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [{ formName: "alice", status: "draft" }],
  }),
  "Alice 2",
  "Lowercase existing matches mixed-case base",
);
eq(
  generateDefaultFormName({
    nickname: "ALICE",
    userForms: [{ formName: "Alice", status: "draft" }],
  }),
  "ALICE 2",
  "Base uses user's casing; collision detected regardless",
);

// ============ 7. Trim-aware matching ============
console.log("--- 7. Trim handling ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [{ formName: "  Alice  ", status: "draft" }],
  }),
  "Alice 2",
  "Whitespace around existing name still matches",
);
eq(
  generateDefaultFormName({
    nickname: "  Alice  ",
  }),
  "Alice",
  "Whitespace in nickname is trimmed",
);

// ============ 8. Empty / missing nickname falls back to 'טופס' ============
console.log("--- 8. Empty nickname fallback ---");
eq(
  generateDefaultFormName({ nickname: "" }),
  DEFAULT_FORM_NAME_FALLBACK,
  "Empty string → fallback",
);
eq(
  generateDefaultFormName({ nickname: null }),
  DEFAULT_FORM_NAME_FALLBACK,
  "null → fallback",
);
eq(
  generateDefaultFormName({ nickname: undefined }),
  DEFAULT_FORM_NAME_FALLBACK,
  "undefined → fallback",
);
eq(
  generateDefaultFormName({ nickname: "   " }),
  DEFAULT_FORM_NAME_FALLBACK,
  "Whitespace-only → fallback",
);
eq(
  generateDefaultFormName({}),
  DEFAULT_FORM_NAME_FALLBACK,
  "No nickname key → fallback",
);
eq(
  generateDefaultFormName(),
  DEFAULT_FORM_NAME_FALLBACK,
  "No args at all → fallback",
);

// ============ 9. Fallback 'טופס' dedups against legacy טופס N forms ============
console.log("--- 9. Fallback dedup against legacy ---");
eq(
  generateDefaultFormName({
    nickname: "",
    userForms: [
      { formName: "טופס", status: "draft" },
      { formName: "טופס 2", status: "draft" },
    ],
  }),
  "טופס 3",
  "Empty nickname + legacy טופס 1,2 → טופס 3",
);

// ============ 10. Nickname equal to fallback 'טופס' ============
console.log("--- 10. Nickname exactly 'טופס' ---");
eq(
  generateDefaultFormName({
    nickname: "טופס",
    userForms: [{ formName: "טופס", status: "draft" }],
  }),
  "טופס 2",
  "User picked 'טופס' as nickname — behaves like any other",
);

// ============ 11. Unicode / emoji ============
console.log("--- 11. Unicode + emoji nicknames ---");
eq(
  generateDefaultFormName({ nickname: "🦁 Leo" }),
  "🦁 Leo",
  "Emoji nickname preserved",
);
eq(
  generateDefaultFormName({
    nickname: "🦁 Leo",
    userForms: [{ formName: "🦁 Leo", status: "draft" }],
  }),
  "🦁 Leo 2",
  "Emoji dedup works",
);

// ============ 12. Long nickname (20-char cap) + suffix stays ≤ 50 chars ============
console.log("--- 12. Long nickname length budget ---");
const longNick = "x".repeat(20);
const longWithSuffix = generateDefaultFormName({
  nickname: longNick,
  userForms: Array.from({ length: 9 }, (_, i) =>
    i === 0
      ? { formName: longNick, status: "draft" }
      : { formName: `${longNick} ${i + 1}`, status: "draft" },
  ),
});
eq(longWithSuffix, `${longNick} 10`, "Long nickname + index 10");
assert(
  longWithSuffix.length <= 50,
  `Long nickname + suffix fits in formName maxLength=50 (got ${longWithSuffix.length})`,
);

// ============ 13. Respects MAX_FORMS_PER_USER=10 — no infinite loop ============
console.log("--- 13. High-density dedup terminates ---");
const manyTaken = {};
for (let i = 1; i <= 500; i++) {
  manyTaken[`f${i}`] = {
    formName: i === 1 ? "Alice" : `Alice ${i}`,
    status: "submitted",
  };
}
const afterMany = generateDefaultFormName({
  nickname: "Alice",
  allPredictions: manyTaken,
});
eq(afterMany, "Alice 501", "Finds next free slot after 500 taken");

// ============ 14. Own-user forms of ANY status block base (readability) ============
console.log("--- 14. Own drafts also block, not only submitted ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [{ formName: "Alice", status: "draft" }],
  }),
  "Alice 2",
  "Own draft blocks base (list would be confusing otherwise)",
);

// ============ 15. Defensive against malformed inputs ============
console.log("--- 15. Malformed data is tolerated ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [null, undefined, {}, { formName: null }, { formName: "Alice" }],
  }),
  "Alice 2",
  "Null/undefined/missing formName entries are skipped",
);
eq(
  generateDefaultFormName({
    nickname: "Alice",
    allPredictions: {
      a: null,
      b: undefined,
      c: { formName: "Alice", status: null },
      d: { formName: "Alice", status: "submitted" },
    },
  }),
  "Alice 2",
  "Null entries/statuses skipped; only 'd' blocks",
);

// ============ 16. Two blank predictions don't pollute taken set ============
console.log("--- 16. Empty formName entries ignored ---");
eq(
  generateDefaultFormName({
    nickname: "Alice",
    userForms: [{ formName: "", status: "draft" }, { formName: "  ", status: "draft" }],
  }),
  "Alice",
  "Empty/whitespace formNames don't count",
);

// ============ 17. Caller contract: store.js wires this in ============
console.log("--- 17. Static check: store.js wires the helper in ---");
const storeSrc = readFileSync(resolve(ROOT, "src/store.js"), "utf8");
assert(
  storeSrc.includes('from "./utils/formNameGenerator"'),
  "store.js imports the helper",
);
assert(
  /generateDefaultFormName\s*\(/.test(storeSrc),
  "store.js calls generateDefaultFormName",
);
assert(
  !/formName\s*\|\|\s*`טופס\s*\$\{displayIndex\}`/.test(storeSrc),
  "Old 'טופס N' fallback in createForm is gone",
);

// ============ 18. FormList uses the helper for placeholder + submit ============
console.log("--- 18. FormList uses the helper ---");
const formListSrc = readFileSync(
  resolve(ROOT, "src/components/FormList.jsx"),
  "utf8",
);
assert(
  formListSrc.includes('from "../utils/formNameGenerator"'),
  "FormList imports the helper",
);
assert(
  /placeholder=\{defaultFormName\}/.test(formListSrc),
  "FormList placeholder uses defaultFormName",
);
assert(
  !/placeholder=\{`טופס \$\{forms\.length \+ 1\}`\}/.test(formListSrc),
  "Old 'טופס N' placeholder is gone",
);
assert(
  /newFormName\.trim\(\)\s*\|\|\s*defaultFormName/.test(formListSrc),
  "FormList submit falls back to defaultFormName when input is empty",
);

// ============ 19. Existing unique-name validation still agrees with helper ============
console.log("--- 19. Validation rule still references the same status set ---");
const validSrc = readFileSync(
  resolve(ROOT, "src/utils/formValidation.js"),
  "utf8",
);
assert(
  /"submitted"/.test(validSrc) &&
    /"approved"/.test(validSrc) &&
    /"pending"/.test(validSrc),
  "formValidation still blocks on submitted/approved/pending (helper must match)",
);

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
