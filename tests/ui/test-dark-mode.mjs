// Regression tests for the dark-mode feature (#10).
//
// Strategy: the theme works by re-pointing the Tailwind colour custom
// properties under `html.dark`, applied before first paint by an inline script
// and toggled by useTheme/ThemeToggle. These assertions lock that wiring in.

import fs from "node:fs";
import { readMigratedSrc, existsMigratedSrc } from "../helpers/readMigratedSrc.mjs";

const REPO = "/home/user/Beeri-World-Cup";
let passed = 0, failed = 0;
const failures = [];
function assert(c, m) {
  if (c) passed++;
  else { failed++; failures.push(m); console.error("  FAIL: " + m); }
}

console.log("=== DARK MODE REGRESSION TESTS ===\n");

// ---- CSS theme overrides ---------------------------------------------------
const css = fs.readFileSync(`${REPO}/src/index.css`, "utf8");
assert(/html\.dark\s*\{/.test(css), "index.css defines an html.dark theme block");
assert(/html\.dark[\s\S]*?--color-bg:\s*#/.test(css), "dark block overrides surface background");
assert(/html\.dark[\s\S]*?--color-ink:\s*#/.test(css), "dark block overrides ink (text) colour");
assert(/html\.dark[\s\S]*?--color-card:\s*#/.test(css), "dark block overrides card surface");
assert(/html\.dark \.bg-white/.test(css), "dark mode remaps the hard-coded bg-white surface to card");
assert(/html\.dark \.input-duo/.test(css), "dark mode remaps white inputs to card");
assert(/color-scheme:\s*dark/.test(css), "dark block sets color-scheme so native controls follow");
assert(/--color-secondary-soft:/.test(css), "secondary-soft token defined (so light-blue panels re-theme)");
assert(/html\.dark[\s\S]*?--color-secondary-soft:/.test(css), "secondary-soft inverts in dark mode");

// No hard-coded light-blue panels remain in app code (they wouldn't re-theme).
import { existsSync as _e } from "node:fs"; void _e;
import { execSync } from "node:child_process";
const hexHits = execSync("grep -rl '#F0F9FF' " + REPO + "/src --include=*.tsx || true").toString().trim();
assert(hexHits === "", "no component hard-codes #F0F9FF (use --color-secondary-soft)");

// ---- No-FOUC bootstrap -----------------------------------------------------
const html = fs.readFileSync(`${REPO}/index.html`, "utf8");
assert(/localStorage\.getItem\("beeri:theme"\)/.test(html), "index.html reads the saved theme before paint");
assert(/classList\.add\("dark"\)/.test(html), "index.html applies the dark class pre-render (no flash)");
assert(/prefers-color-scheme: dark/.test(html), "index.html falls back to the OS preference");

// ---- Theme hook + provider -------------------------------------------------
assert(existsMigratedSrc("src/hooks/useTheme.jsx"), "useTheme module exists");
const theme = readMigratedSrc("src/hooks/useTheme.jsx");
assert(/export function ThemeProvider/.test(theme), "exports ThemeProvider");
assert(/export function useTheme/.test(theme), "exports useTheme hook");
assert(/toggleTheme/.test(theme), "exposes toggleTheme");
assert(/beeri:theme/.test(theme), "persists choice under the shared storage key");
assert(/classList\.toggle\("dark"/.test(theme), "syncs the html.dark class with state");
// Following the OS must not be frozen into an explicit choice on first load.
assert(/explicitRef/.test(theme), "tracks whether the user made an explicit choice");
assert(/if \(explicitRef\.current\)/.test(theme), "persists to storage only after an explicit toggle");

// ---- Toggle mounted in the header ------------------------------------------
assert(existsMigratedSrc("src/components/ThemeToggle.jsx"), "ThemeToggle component exists");
const layout = readMigratedSrc("src/components/Layout.jsx");
assert(/ThemeToggle/.test(layout), "Layout header renders the ThemeToggle");

// ---- Provider mounted at the root ------------------------------------------
const app = readMigratedSrc("src/App.jsx");
assert(/ThemeProvider/.test(app), "App mounts the ThemeProvider");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  failures.forEach((f) => console.error("FAILED: " + f));
  process.exit(1);
}
