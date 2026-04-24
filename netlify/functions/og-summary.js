// Serves a tiny HTML page with Open Graph + Twitter Card meta tags for a
// given summary number, so WhatsApp / Slack / social unfurlers see a rich
// preview instead of a raw link. Human browsers are immediately redirected
// to the SPA so the normal React app loads.
//
// Invoked by a netlify.toml redirect for "/blog/:n" → this function, passing
// the `n` path parameter via query string.
//
// Security: every dynamic string ends up in HTML context; we HTML-escape
// everything and additionally defend against malicious Host headers (which
// would otherwise turn this into an open redirect).

import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";

let adminInitialized = false;
function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  adminInitialized = true;
}

// HTML entity escaper for injecting untrusted strings into HTML attrs/content.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// JSON.stringify does NOT escape `</script>` sequences, so a URL that
// contains `</script>` would break out of the inline redirect script tag.
// Run the standard React-SSR escape after stringifying.
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/ /g, "\\u2028").replace(/ /g, "\\u2029");
}

const SITE_NAME = "בארי מונדיאל";
const DEFAULT_IMAGE =
  "https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png";

// Host allow-list. Any Host header outside this set is ignored in favor of
// the first (canonical) entry. This closes the "Host: evil.com → Location:
// https://evil.com/..." open-redirect vector. Keep in sync with
// netlify/functions/*:ALLOWED_ORIGINS.
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS ||
    "beeri-world-cup.web.app,beeri-world-cup.firebaseapp.com,beeri-world-cup.netlify.app")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
);
const DEFAULT_HOST = [...ALLOWED_HOSTS][0] || "beeri-world-cup.web.app";

function pickSafeHost(rawHost) {
  if (typeof rawHost !== "string") return DEFAULT_HOST;
  // Strip port for the allow-list check; rebuild below.
  const host = rawHost.split(":")[0].toLowerCase();
  return ALLOWED_HOSTS.has(host) ? host : DEFAULT_HOST;
}

function pickSafeProtocol(raw) {
  if (raw === "http" || raw === "https") return raw;
  return "https";
}

async function findSummaryByNumber(n) {
  const db = admin.firestore();
  const snap = await db
    .collection("summaries")
    .where("number", "==", Number(n))
    .where("status", "==", "published")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

function buildHtml({ title, description, url, image }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImage = escapeHtml(image);
  const scriptSafeUrl = jsonForScript(url);
  // Meta refresh + JS redirect so humans immediately land on the SPA.
  // Crawlers (WhatsApp/Twitter/Facebook) read the <head> and don't run JS.
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:image" content="${safeImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  <meta http-equiv="refresh" content="0; url=${safeUrl}">
  <link rel="canonical" href="${safeUrl}">
</head>
<body>
  <p>מעביר אותך ליומן...</p>
  <script>window.location.replace(${scriptSafeUrl});</script>
</body>
</html>`;
}

function buildRedirectUrl(event, n) {
  const host = pickSafeHost(event.headers?.host || event.headers?.Host);
  const protocol = pickSafeProtocol(
    (event.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim(),
  );
  const baseUrl = `${protocol}://${host}`;
  return `${baseUrl}/?page=blog${n ? `&n=${encodeURIComponent(n)}` : ""}`;
}

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
    body: "",
  };
}

async function ogSummaryHandler(event) {
  const rawN = event.queryStringParameters?.n || event.path?.match(/\/blog\/(\d+)/)?.[1];
  const redirectUrl = buildRedirectUrl(event, rawN);

  // Guard: malformed n → redirect without metadata. Digits only, no scientific
  // notation or hex.
  if (!/^\d+$/.test(String(rawN || ""))) {
    return redirect(redirectUrl);
  }

  // Any throw past this point falls back to a plain redirect so the human
  // reader never sees a 500/JSON blob. Crawlers just miss the rich preview.
  try {
    initAdmin();
  } catch (err) {
    console.error("og-summary initAdmin failed:", err?.message || err);
    return redirect(redirectUrl);
  }

  try {
    const summary = await findSummaryByNumber(rawN);
    if (!summary) {
      // Unknown or unpublished summary — send the reader to the SPA which
      // renders a "not found" card with a link to the latest.
      return redirect(redirectUrl);
    }
    const title = summary.title || `סיכום #${summary.number} · ${SITE_NAME}`;
    const description =
      summary.subtitle
      || (typeof summary.intro === "string" ? summary.intro.slice(0, 200) : "")
      || "יומן המונדיאל של קיבוץ בארי";
    const html = buildHtml({
      title,
      description,
      url: redirectUrl,
      image: DEFAULT_IMAGE,
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Short cache so unfurlers see updates within a minute.
        "Cache-Control": "public, max-age=60",
      },
      body: html,
    };
  } catch (err) {
    console.error("og-summary error:", err?.message || err);
    return redirect(redirectUrl);
  }
}

export const handler = withSentry(ogSummaryHandler, "og-summary");
