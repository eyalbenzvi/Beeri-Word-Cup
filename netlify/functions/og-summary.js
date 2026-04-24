// Serves a tiny HTML page with Open Graph + Twitter Card meta tags for a
// given summary number, so WhatsApp / Slack / social unfurlers see a rich
// preview instead of a raw link. Human browsers are immediately redirected
// to the SPA so the normal React app loads.
//
// Invoked by a netlify.toml redirect for "/blog/:n" → this function, passing
// the `n` path parameter via query string.

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

const SITE_NAME = "בארי מונדיאל";
const DEFAULT_IMAGE =
  "https://static.wixstatic.com/media/db36e0_1fb01ba1e87241ecbe761094b74ef14d~mv2.png";

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
  <script>window.location.replace(${JSON.stringify(url)});</script>
</body>
</html>`;
}

async function ogSummaryHandler(event) {
  const n = event.queryStringParameters?.n || event.path?.match(/\/blog\/(\d+)/)?.[1];
  const host = event.headers?.host || "beeri-world-cup.web.app";
  const protocol = (event.headers?.["x-forwarded-proto"] || "https").split(",")[0];
  const baseUrl = `${protocol}://${host}`;
  const redirectUrl = `${baseUrl}/?page=blog${n ? `&n=${encodeURIComponent(n)}` : ""}`;

  // Guard: malformed n → redirect without metadata
  if (!/^\d+$/.test(String(n || ""))) {
    return {
      statusCode: 302,
      headers: { Location: redirectUrl, "Cache-Control": "no-store" },
      body: "",
    };
  }

  try {
    initAdmin();
    const summary = await findSummaryByNumber(n);
    if (!summary) {
      // Unknown or unpublished summary — send the reader to the SPA which
      // renders a "not found" card with a link to the latest.
      return {
        statusCode: 302,
        headers: { Location: redirectUrl, "Cache-Control": "no-store" },
        body: "",
      };
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
    // Best-effort redirect on failure rather than a 500 page for the user.
    return {
      statusCode: 302,
      headers: { Location: redirectUrl, "Cache-Control": "no-store" },
      body: "",
    };
  }
}

export const handler = withSentry(ogSummaryHandler, "og-summary");
