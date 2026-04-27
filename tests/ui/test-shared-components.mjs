// Tests for shared UI components: Spinner, InlineError, ErrorBanner, EmptyState, Badge.
// Uses react createElement (no JSX) + renderToStaticMarkup so it runs under the plain
// test loader without needing a JSX transform.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Spinner from "../../src/components/Spinner.jsx";
import InlineError from "../../src/components/InlineError.jsx";
import ErrorBanner from "../../src/components/ErrorBanner.jsx";
import EmptyState from "../../src/components/EmptyState.jsx";
import Badge from "../../src/components/Badge.jsx";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const h = React.createElement;
const r = (el) => renderToStaticMarkup(el);

console.log("=== SHARED COMPONENTS TESTS ===\n");

// --- Spinner ---
console.log("--- Spinner ---");
{
  const html = r(h(Spinner, { label: "טוען..." }));
  assert(html.includes("role=\"status\""), "Spinner has role=status");
  assert(html.includes("aria-live=\"polite\""), "Spinner has aria-live polite");
  assert(html.includes("animate-spin"), "Spinner has animate-spin class");
  assert(html.includes("טוען..."), "Spinner renders label");
}
{
  const html = r(h(Spinner, { size: "lg" }));
  assert(html.includes("w-8 h-8"), "Spinner size=lg → w-8 h-8");
}
{
  const html = r(h(Spinner, { size: "sm" }));
  assert(html.includes("w-3 h-3"), "Spinner size=sm → w-3 h-3");
}
{
  const html = r(h(Spinner, {}));
  assert(!html.includes("undefined"), "Spinner with no label does not render 'undefined'");
}

// --- InlineError ---
console.log("--- InlineError ---");
{
  const html = r(h(InlineError, {}, "שגיאה"));
  assert(html.includes("role=\"alert\""), "InlineError has role=alert");
  assert(html.includes("text-danger"), "InlineError uses text-danger");
  assert(html.includes("שגיאה"), "InlineError renders children");
  assert(html.includes("text-right"), "InlineError default align is right (RTL)");
}
{
  const html = r(h(InlineError, { align: "center" }, "שגיאה"));
  assert(html.includes("text-center"), "InlineError align=center → text-center");
}
{
  const html = r(h(InlineError, {}, null));
  assert(html === "", "InlineError with null children returns nothing");
}

// --- ErrorBanner ---
console.log("--- ErrorBanner ---");
{
  const html = r(h(ErrorBanner, {}, "נכשל"));
  assert(html.includes("role=\"alert\""), "ErrorBanner has role=alert");
  assert(html.includes("alert-danger-soft"), "ErrorBanner uses alert-danger-soft class");
  assert(html.includes("נכשל"), "ErrorBanner renders message");
  assert(html.includes("⚠️"), "ErrorBanner has default warning icon");
}
{
  const html = r(h(ErrorBanner, { onRetry: () => {}, retryLabel: "נסה שוב" }, "נכשל"));
  assert(html.includes("נסה שוב"), "ErrorBanner renders retry button when onRetry given");
}
{
  const html = r(h(ErrorBanner, {}, "X"));
  assert(!html.includes("נסה שוב"), "ErrorBanner hides retry button without onRetry");
}
{
  const html = r(h(ErrorBanner, { onDismiss: () => {} }, "X"));
  assert(html.includes("aria-label=\"סגור\""), "ErrorBanner dismiss button has aria-label");
}
{
  const html = r(h(ErrorBanner, { icon: null }, "X"));
  assert(!html.includes("⚠️"), "ErrorBanner with icon=null has no icon");
}
{
  const html = r(h(ErrorBanner, {}, null));
  assert(html === "", "ErrorBanner with null children returns nothing");
}

// --- EmptyState ---
console.log("--- EmptyState ---");
{
  const html = r(h(EmptyState, { title: "אין תוצאות", description: "נסה שוב מאוחר יותר" }));
  assert(html.includes("אין תוצאות"), "EmptyState renders title");
  assert(html.includes("נסה שוב מאוחר יותר"), "EmptyState renders description");
  assert(html.includes("py-12"), "EmptyState uses py-12 (standardized empty state padding)");
}
{
  const html = r(h(EmptyState, { icon: "📋" }));
  assert(html.includes("📋"), "EmptyState renders icon");
  assert(html.includes("aria-hidden=\"true\""), "EmptyState icon is aria-hidden");
}
{
  const btn = h("button", {}, "צור טופס");
  const html = r(h(EmptyState, { cta: btn, title: "אין" }));
  assert(html.includes("צור טופס"), "EmptyState renders cta element");
}

// --- Badge ---
console.log("--- Badge ---");
{
  const html = r(h(Badge, {}, "חדש"));
  assert(html.includes("badge-duo"), "Badge uses badge-duo class");
  assert(html.includes("badge-duo-muted"), "Badge default variant is muted");
  assert(html.includes("חדש"), "Badge renders children");
}
{
  const html = r(h(Badge, { variant: "primary" }, "X"));
  assert(html.includes("badge-duo-primary"), "Badge variant=primary");
}
{
  const html = r(h(Badge, { variant: "danger" }, "X"));
  assert(html.includes("badge-duo-danger"), "Badge variant=danger");
}
{
  const html = r(h(Badge, { icon: "🔒" }, "נעול"));
  assert(html.includes("🔒"), "Badge renders icon");
  assert(html.includes("aria-hidden=\"true\""), "Badge icon is aria-hidden");
}

console.log("\n=== SHARED COMPONENTS: " + passed + " passed, " + failed + " failed ===");
if (failed > 0) {
  console.log("Failures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
