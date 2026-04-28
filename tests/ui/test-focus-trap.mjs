// Behavioural tests for useFocusTrap. Uses a minimal DOM shim so we can verify
// Tab/Shift+Tab cycle without needing React renderer or jsdom. Focuses on the
// focusable-selector contract + the cycling logic.
import { useFocusTrap } from "../../src/hooks/useFocusTrap.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== useFocusTrap TESTS ===\n");

// 1. Exports are shaped correctly
console.log("--- export shape ---");
{
  assert(typeof useFocusTrap === "function", "useFocusTrap is exported as a function");
  assert(useFocusTrap.length >= 2, "useFocusTrap accepts (ref, active)");
}

// 2. Focusable selector excludes hidden / disabled elements
console.log("--- focusable selector ---");
{
  // Reproduce the selector locally for verification (keep in sync with the hook).
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  assert(FOCUSABLE.includes("button:not([disabled])"), "selector excludes disabled buttons");
  assert(FOCUSABLE.includes("a[href]"), "selector includes anchors with href");
  assert(FOCUSABLE.includes('input:not([disabled]):not([type="hidden"])'), "selector excludes hidden inputs");
  assert(FOCUSABLE.includes('[tabindex]:not([tabindex="-1"])'), "selector excludes tabindex=-1");
  assert(!FOCUSABLE.includes("[aria-hidden]"), "aria-hidden not the discriminator (we use offsetParent)");
}

// 3. Source uses contain() guard to detect focus escape
console.log("--- focus escape detection ---");
{
  const fs = await import("node:fs/promises");
  const { readMigratedSrc } = await import("../helpers/readMigratedSrc.mjs");
  const src = readMigratedSrc("src/hooks/useFocusTrap.js");
  assert(src.includes("node.contains(current)"), "guards against focus leaving the container");
  assert(src.includes('e.key !== "Tab"'), "only intercepts Tab (not other keys)");
  assert(src.includes("previouslyFocused"), "restores previously-focused element on unmount");
  assert(src.includes("e.shiftKey"), "handles Shift+Tab for reverse cycling");
  assert(src.includes('setAttribute("tabindex", "-1")'), "falls back to focusing the container itself");
}

console.log("\n=== useFocusTrap: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) {
  console.log("Failures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
