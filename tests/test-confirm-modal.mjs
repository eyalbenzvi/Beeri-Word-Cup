// Tests the ConfirmModal public contract: string argument and options
// argument produce the same promise-based API. Focus is on the data shape
// (since we can't drive Promise resolution without a React renderer).
import fs from "node:fs/promises";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== ConfirmModal TESTS ===\n");

const src = await fs.readFile(
  new URL("../src/components/ConfirmModal.jsx", import.meta.url),
  "utf8",
);

console.log("--- API contract ---");
// 1. Accepts both string and object form
assert(
  src.includes('typeof messageOrOpts === "string"'),
  "accepts both string and options object forms",
);

// 2. Exposes all required props with defaults
assert(src.includes('confirmLabel: opts.confirmLabel || "אישור"'), 'default confirmLabel = "אישור"');
assert(src.includes('cancelLabel: opts.cancelLabel || "ביטול"'), 'default cancelLabel = "ביטול"');
assert(src.includes('variant: opts.variant || "primary"'), 'default variant = primary');
assert(src.includes("title: opts.title || null"), "optional title");

// 3. Returns a Promise
assert(src.includes("return new Promise((resolve)"), "returns a Promise");

// 4. variant=danger wires up btn-duo-danger
assert(src.includes('state?.variant === "danger"'), "danger variant routed to danger button");
assert(src.includes("btn-duo-danger"), "danger variant uses btn-duo-danger class");

console.log("--- a11y ---");
// 5. Dialog semantics
assert(src.includes('role="dialog"'), "has role=dialog");
assert(src.includes('aria-modal="true"'), "has aria-modal=true");
assert(src.includes('aria-describedby="confirm-message"'), "aria-describedby wired to message");

// 6. Escape key closes
assert(src.includes('e.key === "Escape"'), "Escape closes modal");

// 7. Backdrop click cancels
assert(
  src.includes("e.target === e.currentTarget") && src.includes("handleCancel"),
  "backdrop click triggers cancel",
);

// 8. Focus trap wired up
assert(src.includes("useFocusTrap(dialogRef"), "focus trap attached to dialog ref");

console.log("\n=== ConfirmModal: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) {
  console.log("Failures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
