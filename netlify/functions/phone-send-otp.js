import crypto from "crypto";

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

// In-memory rate limiting (resets on cold start — sufficient for serverless)
const rateLimits = {};
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS_PER_PHONE = 3;
const MAX_SENDS_PER_IP = 10;

function checkRateLimit(key, max) {
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key] = rateLimits[key].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (rateLimits[key].length >= max) return false;
  rateLimits[key].push(now);
  return true;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: getCorsHeaders(event) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const { INFORU_API_TOKEN, INFORU_USERNAME, INFORU_SENDER, OTP_SECRET } = process.env;
  if (!INFORU_API_TOKEN || !INFORU_USERNAME || !OTP_SECRET) {
    return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { phone } = body;
  if (!phone || !/^05\d{8}$/.test(phone.replace(/[-\s]/g, ""))) {
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "מספר טלפון לא תקין (05XXXXXXXX)" }) };
  }

  const cleanPhone = phone.replace(/[-\s]/g, "");

  // Rate limiting per phone and per IP
  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || event.headers["client-ip"] || "unknown";
  if (!checkRateLimit(`phone:${cleanPhone}`, MAX_SENDS_PER_PHONE)) {
    return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי בקשות. נסה שוב בעוד מספר דקות" }) };
  }
  if (!checkRateLimit(`ip:${clientIp}`, MAX_SENDS_PER_IP)) {
    return { statusCode: 429, headers: getCorsHeaders(event), body: JSON.stringify({ error: "יותר מדי בקשות מכתובת זו. נסה שוב מאוחר יותר" }) };
  }

  // Generate 6-digit OTP (cryptographically secure)
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Create HMAC verification token (stateless — no DB needed)
  const hmacData = `${cleanPhone}:${code}:${expiresAt}`;
  const verificationToken = crypto.createHmac("sha256", OTP_SECRET).update(hmacData).digest("hex");

  // Send SMS via Inforu (XML API — primary documented endpoint)
  const smsMessage = `קוד האימות שלך לטורניר בארי: ${code}`;
  const sender = INFORU_SENDER || "Beeri";

  const xml = `<Inforu>
<User>
<Username>${INFORU_USERNAME}</Username>
<ApiToken>${INFORU_API_TOKEN}</ApiToken>
</User>
<Content Type="sms">
<Message>${smsMessage}</Message>
</Content>
<Recipients>
<PhoneNumber>${cleanPhone}</PhoneNumber>
</Recipients>
<Settings>
<Sender>${sender}</Sender>
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
        body: JSON.stringify({ error: `שליחת SMS נכשלה: ${smsBody.slice(0, 200)}` }),
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
