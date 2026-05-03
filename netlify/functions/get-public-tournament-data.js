// Public endpoint that returns tournament data (predictions + userDirectory +
// actualBonuses + actualAdvancing) so guests (logged-out visitors) can browse
// the leaderboard / stats / forms tabs without an account.
//
// Privacy gate: data is ONLY returned when `predictionsLocked === true`. This
// mirrors the existing Firestore rule that allows any authenticated user to
// read every form once the tournament has started (`isLocked()` branch in
// firestore.rules). Pre-lock, the function returns an empty payload — the UI
// then falls through to the same "locked until tournament starts" panel that
// pre-lock authed users already see.
//
// Why a Netlify function and not a public Firestore rule:
//   The unauthenticated Firestore SDK collection-query listener has been
//   observed to hang indefinitely in incognito (no success, no error fired) —
//   see netlify/functions/get-public-summaries.js and src/store/publicMode.ts
//   for the same pattern. Plain HTTPS GETs have no such failure mode.
//
// Uses the Firebase Admin SDK (bypasses Firestore security rules).

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
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
}

async function getPublicTournamentDataHandler(event) {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    initAdmin();
    const db = admin.firestore();
    const settingsSnap = await db.collection("gameData").doc("settings").get();
    const settingsData = settingsSnap.exists ? settingsSnap.data()?.data : null;
    const predictionsLocked = !!(settingsData && settingsData.predictionsLocked);

    if (!predictionsLocked) {
      // Pre-lock: don't expose predictions/userDirectory/actualBonuses to
      // anonymous visitors. Shape matches post-lock so the client can treat
      // the payload uniformly.
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          predictionsLocked: false,
          predictions: {},
          userDirectory: {},
          actualBonuses: { champion: null, topScorers: [] },
          actualAdvancing: {},
        }),
      };
    }

    // Post-lock: return everything the leaderboard/stats/allforms tabs need.
    const [
      predictionsSnap,
      userDirSnap,
      actualBonusesSnap,
      actualAdvancingSnap,
    ] = await Promise.all([
      db
        .collection("predictions")
        .where("status", "in", ["submitted", "approved"])
        .get(),
      db.collection("gameData").doc("userDirectory").get(),
      db.collection("gameData").doc("actualBonuses").get(),
      db.collection("gameData").doc("actualAdvancing").get(),
    ]);

    const predictions = {};
    predictionsSnap.forEach((doc) => {
      predictions[doc.id] = doc.data();
    });

    const userDirectory = userDirSnap.exists
      ? userDirSnap.data()?.data || {}
      : {};
    const actualBonuses = actualBonusesSnap.exists
      ? actualBonusesSnap.data()?.data || {
          champion: null,
          topScorers: [],
        }
      : { champion: null, topScorers: [] };
    const actualAdvancing = actualAdvancingSnap.exists
      ? actualAdvancingSnap.data()?.data || {}
      : {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        predictionsLocked: true,
        predictions,
        userDirectory,
        actualBonuses,
        actualAdvancing,
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

export const handler = withSentry(
  getPublicTournamentDataHandler,
  "get-public-tournament-data",
);
