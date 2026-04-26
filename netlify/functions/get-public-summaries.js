// Public endpoint that returns all published summaries so the guest /blog
// page can render without depending on a browser-side Firestore listener.
//
// Background: the unauth Firestore SDK collection-query listener for
// `summaries where status == 'published'` was observed to hang
// indefinitely in incognito (no success, no error), trapping guest viewers
// on the empty state. Settings + matchResults already use this same
// Admin-SDK-via-function pattern (see get-public-settings.js); this just
// extends it to summaries so the unauth path has no flaky listener at all.
// Authenticated users keep their realtime listener.
//
// Uses the Firebase Admin SDK (bypasses Firestore security rules), so
// this works regardless of client transport state.
import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";

let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  adminInitialized = true;
}

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173"
).split(",");

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
}

async function getPublicSummariesHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    initAdmin();
    const snap = await admin
      .firestore()
      .collection("summaries")
      .where("status", "==", "published")
      .get();
    const summaries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ summaries }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || "Internal error" }),
    };
  }
}

export const handler = withSentry(getPublicSummariesHandler, "get-public-summaries");
