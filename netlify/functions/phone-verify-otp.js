import crypto from "crypto";
import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";
import { buildCorsHeaders } from "./_lib/cors.js";
import { normalizeIsraeliMobile } from "../../src/utils/phone.js";
import { deriveHashedUid } from "../../src/utils/uidHash.js";

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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://beeri-world-cup.web.app,https://beeri-world-cup.firebaseapp.com,http://localhost:5173").split(",");

function getCorsHeaders(event) {
  return buildCorsHeaders(event, { allowedOrigins: ALLOWED_ORIGINS, allowHeaders: "Content-Type" });
}

// Persistent brute-force protection — counter lives in Firestore so it
// survives cold starts (the old in-memory map could be flushed by spamming
// a quiet period and then retrying the same token).
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_DOC_TTL_MS = 15 * 60 * 1000; // > 5-min OTP TTL, generous buffer

function verifyDocId(token) {
  return String(token).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120);
}

async function checkAndIncrementVerifyAttempts(token) {
  const ref = admin.firestore().collection("otpVerifyAttempts").doc(verifyDocId(token));
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.exists ? snap.data()?.count : 0) || 0;
    if (prev >= MAX_VERIFY_ATTEMPTS) return false;
    const now = Date.now();
    tx.set(ref, {
      count: prev + 1,
      expiresAt: admin.firestore.Timestamp.fromMillis(now + VERIFY_DOC_TTL_MS),
    });
    return true;
  });
}

async function invalidateVerifyToken(token) {
  const ref = admin.firestore().collection("otpVerifyAttempts").doc(verifyDocId(token));
  const now = Date.now();
  await ref.set({
    count: MAX_VERIFY_ATTEMPTS + 1,
    expiresAt: admin.firestore.Timestamp.fromMillis(now + VERIFY_DOC_TTL_MS),
  });
}

async function phoneVerifyOtpHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(event) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const { OTP_SECRET, FIREBASE_SERVICE_ACCOUNT } = process.env;
  if (!OTP_SECRET || !FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { phone, code, verificationToken, expiresAt } = body;
  if (!phone || !code || !verificationToken || !expiresAt) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Missing fields" }) };
  }

  // Canonicalize before anything phone-keyed (HMAC, UID) so that an attacker
  // who reformats the number can't bypass the HMAC bound to send-time.
  const cleanPhone = normalizeIsraeliMobile(phone);
  if (!cleanPhone) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "מספר נייד ישראלי לא תקין" }) };
  }

  // Firestore admin SDK is needed for both brute-force counter and custom token.
  try {
    initAdmin();
  } catch (err) {
    console.error("Admin init failed:", err?.message || err);
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Server error" }) };
  }

  // Persistent brute-force protection: limit attempts per token.
  try {
    const allowed = await checkAndIncrementVerifyAttempts(verificationToken);
    if (!allowed) {
      return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי ניסיונות. בקש קוד חדש" }) };
    }
  } catch (err) {
    console.error("Verify-limit check failed:", err?.message || err);
    return { statusCode: 503, headers: getCorsHeaders(event), body: JSON.stringify({ error: "שירות זמני לא זמין. נסה שוב" }) };
  }

  // Check expiry
  if (Date.now() > expiresAt) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "הקוד פג תוקף. שלח קוד חדש" }) };
  }

  // Verify HMAC
  const hmacData = `${cleanPhone}:${code}:${expiresAt}`;
  const expectedToken = crypto.createHmac("sha256", OTP_SECRET).update(hmacData).digest("hex");

  // Constant-time comparison to prevent timing attacks
  const bufA = Buffer.from(verificationToken, "hex");
  const bufB = Buffer.from(expectedToken, "hex");
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "קוד שגוי. נסה שוב" }) };
  }

  // Invalidate token after successful verification (single-use)
  try {
    await invalidateVerifyToken(verificationToken);
  } catch (err) {
    // Not fatal for this request, but log it — invalidation is defense-in-depth.
    console.error("Token invalidation failed:", err?.message || err);
  }

  // Resolve the Firebase Auth UID for this phone number.
  //
  // Two formats coexist during the PII migration:
  //   - Legacy:  phone_<E.164-ish phone>             (PII embedded in UID)
  //   - Hashed:  phone_<first 16 hex of SHA-256(salt+phone)>  (opaque)
  //
  // Resolution rules:
  //   - If USE_HASHED_UID="true" AND OTP_SALT is set:
  //       * Compute the deterministic hashed UID for this phone.
  //       * Read gameData/uidMigrationMap.  If it carries an explicit mapping
  //         from the legacy UID to a different hashed UID (e.g. after a salt
  //         rotation, or because the migration tool decided the canonical
  //         target), honour it — the map is the source of truth so that
  //         records aren't orphaned.
  //       * Otherwise mint the freshly computed hashed UID. New users land
  //         here directly; pre-migrated users land on a hashed UID that
  //         matches whatever the migration script wrote.
  //   - Else: stay on the legacy `phone_<phone>` UID.
  //
  // Code is INERT until OTP_SALT is set + USE_HASHED_UID flipped to "true",
  // so this PR can land without changing any existing user's UID.
  let uid = `phone_${cleanPhone}`;
  try {
    const useHashed = process.env.USE_HASHED_UID === "true";
    const salt = process.env.OTP_SALT;
    if (useHashed && salt) {
      const hashedUid = deriveHashedUid(cleanPhone, salt);
      let mappedUid = null;
      try {
        const mapSnap = await admin
          .firestore()
          .collection("gameData")
          .doc("uidMigrationMap")
          .get();
        const mapData = mapSnap.exists ? mapSnap.data()?.data : null;
        if (mapData && typeof mapData === "object") {
          const candidate = mapData[uid];
          if (typeof candidate === "string" && candidate.startsWith("phone_")) {
            mappedUid = candidate;
          }
        }
      } catch (err) {
        // Failing closed here would lock users out during a Firestore blip.
        // Fall back to the deterministic hashed UID — it's what the migration
        // script targets by default, so existing users still resolve to their
        // own data.
        console.error("uidMigrationMap lookup failed:", err?.message || err);
      }
      uid = mappedUid || hashedUid;
    }
  } catch (err) {
    // Defensive: never let a config error block a legitimate login. We log
    // and fall through to the legacy UID rather than refusing to mint a
    // token.
    console.error("UID resolution failed, falling back to legacy:", err?.message || err);
    uid = `phone_${cleanPhone}`;
  }

  // Create Firebase custom auth token. We deliberately do NOT include the
  // phone number in the token's custom claims when using the hashed UID —
  // the whole point is that the UID stops carrying PII.
  try {
    const customToken = await admin.auth().createCustomToken(uid);

    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ success: true, customToken }),
    };
  } catch (err) {
    console.error("Firebase custom token error:", err);
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "שגיאה ביצירת הסשן" }) };
  }
}

export const handler = withSentry(phoneVerifyOtpHandler, "phone-verify-otp");
