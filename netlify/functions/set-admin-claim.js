import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";
import { buildCorsHeaders, resolveAllowedOrigins } from "./_lib/cors.js";

let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  // Force Firestore REST transport (firebase-admin gRPC hangs on Netlify cold
  // starts -> 504s under load). try/catch so a re-init can never throw.
  try { admin.firestore().settings({ preferRest: true }); } catch { /* already set */ }
  adminInitialized = true;
}

const ALLOWED_ORIGINS = resolveAllowedOrigins(process.env.ALLOWED_ORIGINS);

function getCorsHeaders(event) {
  return buildCorsHeaders(event, { allowedOrigins: ALLOWED_ORIGINS });
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

    // PII migration Phase A: dual-write isAdmin to legacy users + new
    // userPrivate doc. firestore.rules `isAdmin()` helper still falls
    // back to legacy users during the compat window; the cut-over PR
    // switches it to read userPrivate/{uid}.isAdmin instead. Until then
    // both paths must stay in sync. Admin SDK bypasses security rules so
    // we can write either path freely.
    const fs = admin.firestore();
    const userPrivateRef = fs.doc(`userPrivate/${targetUid}`);
    await Promise.all([
      fs.doc("gameData/users").update({
        [`data.${targetUid}.isAdmin`]: isAdmin,
      }),
      userPrivateRef.set({ isAdmin }, { merge: true }),
    ]);

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
