// Public endpoint that exposes `predictionsLocked` and `matchResults` so the
// welcome screen can decide what to show for logged-out visitors and filter
// out already-played matches from the "next matches" widget.
//
// Uses the Firebase Admin SDK (bypasses Firestore security rules), so
// this works even when the rules haven't granted unauth reads of
// `gameData/settings` or `gameData/matchResults`.

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

async function getPublicSettingsHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    initAdmin();
    const col = admin.firestore().collection("gameData");
    const [settingsSnap, resultsSnap] = await Promise.all([
      col.doc("settings").get(),
      col.doc("matchResults").get(),
    ]);
    const settingsData = settingsSnap.exists ? settingsSnap.data()?.data : null;
    const resultsData = resultsSnap.exists ? resultsSnap.data()?.data : null;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        predictionsLocked: !!(settingsData && settingsData.predictionsLocked),
        matchResults: resultsData && typeof resultsData === "object" ? resultsData : {},
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || "Internal error" }),
    };
  }
}

export const handler = withSentry(getPublicSettingsHandler, "get-public-settings");
