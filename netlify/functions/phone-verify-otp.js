import crypto from "crypto";
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
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
  const cleanPhone = phone.replace(/[-\s]/g, "");
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

  // Create Firebase custom auth token
  // Use phone number as UID (prefixed to avoid collisions with Google UIDs)
  try {
    const uid = `phone_${cleanPhone}`;
    const customToken = await admin.auth().createCustomToken(uid, { phone: cleanPhone });

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
