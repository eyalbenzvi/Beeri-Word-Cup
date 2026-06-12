import crypto from "crypto";
import admin from "firebase-admin";
import { withSentry } from "./_sentry.js";
import { normalizeIsraeliMobile } from "../../src/utils/phone.js";

let adminInitialized = false;
function initAdmin() {
  if (adminInitialized) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  // Force Firestore REST transport. firebase-admin's default gRPC channel hangs
  // on cold starts in Netlify functions, causing 504 timeouts under load (e.g.
  // a tournament-launch traffic spike). REST avoids it. try/catch so a re-init
  // can never throw.
  try { admin.firestore().settings({ preferRest: true }); } catch { /* already set */ }
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

// Persistent sliding-window rate limiting backed by Firestore.
// Survives Netlify cold starts — in-memory counters were trivially bypassed.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS_PER_PHONE = 3;
const MAX_SENDS_PER_IP = 10;

// Escape XML special chars for safe interpolation into Inforu XML payload.
const XML_ESCAPES = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
function escapeXml(s) {
  return String(s ?? "").replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);
}

// Validate hostname against RFC-1123 label pattern before using in SMS body.
function sanitizeHostname(h) {
  return /^[a-z0-9.-]{1,253}$/i.test(h) ? h : "";
}

// Firestore doc ID-safe key (alnum, underscore, colon, dot allowed).
function rateLimitDocId(kind, raw) {
  return `${kind}_${String(raw).replace(/[^A-Za-z0-9_.:-]/g, "_")}`;
}

// Atomic sliding-window check via Firestore transaction. Fail-closed on error.
async function checkPersistentRateLimit(kind, raw, max) {
  const docId = rateLimitDocId(kind, raw);
  const ref = admin.firestore().collection("rateLimit").doc(docId);
  const now = Date.now();
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.exists && Array.isArray(snap.data()?.attempts)) ? snap.data().attempts : [];
    const fresh = prev.filter((ts) => typeof ts === "number" && now - ts < RATE_LIMIT_WINDOW_MS);
    if (fresh.length >= max) return false;
    fresh.push(now);
    tx.set(ref, {
      attempts: fresh,
      // expiresAt lets a Firestore TTL policy garbage-collect old docs.
      expiresAt: admin.firestore.Timestamp.fromMillis(now + RATE_LIMIT_WINDOW_MS),
    });
    return true;
  });
}

async function phoneSendOtpHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(event) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const { INFORU_API_TOKEN, INFORU_USERNAME, INFORU_SENDER, OTP_SECRET, FIREBASE_SERVICE_ACCOUNT } = process.env;
  if (!INFORU_API_TOKEN || !INFORU_USERNAME || !OTP_SECRET || !FIREBASE_SERVICE_ACCOUNT) {
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { phone } = body;
  const cleanPhone = normalizeIsraeliMobile(phone);
  if (!cleanPhone) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "מספר נייד ישראלי לא תקין" }) };
  }

  // Persistent rate limiting per phone and per IP (fail-closed on Firestore errors).
  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || event.headers["client-ip"] || "unknown";
  try {
    initAdmin();
    const phoneOk = await checkPersistentRateLimit("phone", cleanPhone, MAX_SENDS_PER_PHONE);
    if (!phoneOk) {
      return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי בקשות. נסה שוב בעוד מספר דקות" }) };
    }
    const ipOk = await checkPersistentRateLimit("ip", clientIp, MAX_SENDS_PER_IP);
    if (!ipOk) {
      return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי בקשות מכתובת זו. נסה שוב מאוחר יותר" }) };
    }
  } catch (err) {
    console.error("Rate-limit check failed:", err?.message || err);
    return { statusCode: 503, headers: getCorsHeaders(event), body: JSON.stringify({ error: "שירות זמני לא זמין. נסה שוב" }) };
  }

  // Generate 6-digit OTP (cryptographically secure)
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Create HMAC verification token (stateless — no DB needed)
  const hmacData = `${cleanPhone}:${code}:${expiresAt}`;
  const verificationToken = crypto.createHmac("sha256", OTP_SECRET).update(hmacData).digest("hex");

  // Send SMS via Inforu (XML API — primary documented endpoint).
  // The trailing `@host #code` line lets Chrome for Android auto-fill via the
  // Web OTP API (navigator.credentials.get({ otp })). Ignored by other clients.
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  let otpHost = "";
  try {
    if (origin) otpHost = sanitizeHostname(new URL(origin).hostname);
  } catch {
    otpHost = "";
  }
  const otpSuffix = otpHost ? `\n\n@${otpHost} #${code}` : "";
  const smsMessage = `קוד האימות שלך לטורניר בארי: ${code}${otpSuffix}`;
  const sender = INFORU_SENDER || "Beeri";

  const xml = `<Inforu>
<User>
<Username>${escapeXml(INFORU_USERNAME)}</Username>
<ApiToken>${escapeXml(INFORU_API_TOKEN)}</ApiToken>
</User>
<Content Type="sms">
<Message>${escapeXml(smsMessage)}</Message>
</Content>
<Recipients>
<PhoneNumber>${escapeXml(cleanPhone)}</PhoneNumber>
</Recipients>
<Settings>
<Sender>${escapeXml(sender)}</Sender>
</Settings>
</Inforu>`;

  try {
    const inforuUrl = `https://api.inforu.co.il/SendMessageXml.ashx?InforuXML=${encodeURIComponent(xml)}`;
    const smsRes = await fetch(inforuUrl);
    const smsBody = await smsRes.text();
    console.log("Inforu response:", smsRes.status, smsBody);

    // Inforu returns XML with Status=1 for success, negative for errors
    if (smsBody.includes("<Status>1</Status>") || smsBody.includes("<Status> 1 </Status>")) {
      // Success
    } else {
      console.error("Inforu SMS failed:", smsBody);
      return {
        statusCode: 502,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ error: "שליחת SMS נכשלה. נסה שוב בעוד מספר רגעים" }),
      };
    }
  } catch (err) {
    console.error("Inforu fetch error:", err);
    return { statusCode: 502, headers: getCorsHeaders(event), body: JSON.stringify({ error: "שגיאת רשת בשליחת SMS" }) };
  }

  return {
    statusCode: 200,
    headers: getCorsHeaders(event),
    body: JSON.stringify({
      success: true,
      verificationToken,
      expiresAt,
    }),
  };
}

export const handler = withSentry(phoneSendOtpHandler, "phone-send-otp");
