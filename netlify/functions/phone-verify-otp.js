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

// In-memory brute force protection (resets on cold start)
const verifyAttempts = {};
const MAX_VERIFY_ATTEMPTS = 5;

function checkVerifyLimit(token) {
  if (!verifyAttempts[token]) verifyAttempts[token] = 0;
  verifyAttempts[token]++;
  return verifyAttempts[token] <= MAX_VERIFY_ATTEMPTS;
}

function invalidateToken(token) {
  verifyAttempts[token] = MAX_VERIFY_ATTEMPTS + 1; // prevent reuse
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

  // Brute force protection: limit attempts per token
  if (!checkVerifyLimit(verificationToken)) {
    return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי ניסיונות. בקש קוד חדש" }) };
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
  invalidateToken(verificationToken);

  // Create Firebase custom auth token
  // Use phone number as UID (prefixed to avoid collisions with Google UIDs)
  try {
    initAdmin();
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
