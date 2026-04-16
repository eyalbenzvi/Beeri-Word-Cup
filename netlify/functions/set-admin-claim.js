import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";

let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  adminInitialized = true;
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173").split(",");

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

async function setAdminClaimHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const headers = getCorsHeaders(event);

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { targetUid, action } = body;
  if (!targetUid || !action || !["promote", "demote"].includes(action)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing targetUid or invalid action" }) };
  }

  // Extract and verify the caller's Firebase ID token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Missing authorization token" }) };
  }

  try {
    initAdmin();

    // Verify the caller's identity
    const callerClaims = await admin.auth().verifyIdToken(idToken);
    const callerUid = callerClaims.uid;

    // Check if caller is admin — either via custom claim or via Firestore users doc (migration support)
    let callerIsAdmin = callerClaims.admin === true;

    if (!callerIsAdmin) {
      // Fallback: check Firestore users doc (supports migration period before all admins have claims)
      const usersDoc = await admin.firestore().doc("gameData/users").get();
      const usersData = usersDoc.data()?.data || {};
      callerIsAdmin = usersData[callerUid]?.isAdmin === true;
    }

    if (!callerIsAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Caller is not admin" }) };
    }

    // Prevent self-demotion if last admin
    if (action === "demote" && callerUid === targetUid) {
      const usersDoc = await admin.firestore().doc("gameData/users").get();
      const usersData = usersDoc.data()?.data || {};
      const adminCount = Object.values(usersData).filter((u) => u.isAdmin).length;
      if (adminCount <= 1) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Cannot demote the last admin" }) };
      }
    }

    // Set or remove admin custom claim
    const isAdmin = action === "promote";
    await admin.auth().setCustomUserClaims(targetUid, { admin: isAdmin });

    // Also update Firestore users doc for consistency (client reads from here)
    await admin.firestore().doc("gameData/users").update({
      [`data.${targetUid}.isAdmin`]: isAdmin,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, action, targetUid, admin: isAdmin }),
    };
  } catch (err) {
    console.error("set-admin-claim error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
}

export const handler = withSentry(setAdminClaimHandler, "set-admin-claim");
