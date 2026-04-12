import crypto from "crypto";
import admin from "firebase-admin";

let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  adminInitialized = true;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const { OTP_SECRET, FIREBASE_SERVICE_ACCOUNT } = process.env;
  if (!OTP_SECRET || !FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { phone, code, verificationToken, expiresAt } = body;
  if (!phone || !code || !verificationToken || !expiresAt) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing fields" }) };
  }

  // Check expiry
  if (Date.now() > expiresAt) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "הקוד פג תוקף. שלח קוד חדש" }) };
  }

  // Verify HMAC
  const cleanPhone = phone.replace(/[-\s]/g, "");
  const hmacData = `${cleanPhone}:${code}:${expiresAt}`;
  const expectedToken = crypto.createHmac("sha256", OTP_SECRET).update(hmacData).digest("hex");

  if (verificationToken !== expectedToken) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "קוד שגוי. נסה שוב" }) };
  }

  // Create Firebase custom auth token
  // Use phone number as UID (prefixed to avoid collisions with Google UIDs)
  try {
    initAdmin();
    const uid = `phone_${cleanPhone}`;
    const customToken = await admin.auth().createCustomToken(uid, { phone: cleanPhone });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, customToken }),
    };
  } catch (err) {
    console.error("Firebase custom token error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "שגיאה ביצירת הסשן" }) };
  }
}
