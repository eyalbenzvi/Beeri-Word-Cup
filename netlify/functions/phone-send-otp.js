import crypto from "crypto";

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

  const { INFORU_API_TOKEN, INFORU_USERNAME, INFORU_SENDER, OTP_SECRET } = process.env;
  if (!INFORU_API_TOKEN || !INFORU_USERNAME || !OTP_SECRET) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing server configuration" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { phone } = body;
  if (!phone || !/^05\d{8}$/.test(phone.replace(/[-\s]/g, ""))) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "מספר טלפון לא תקין (05XXXXXXXX)" }) };
  }

  const cleanPhone = phone.replace(/[-\s]/g, "");

  // Generate 6-digit OTP
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Create HMAC verification token (stateless — no DB needed)
  const hmacData = `${cleanPhone}:${code}:${expiresAt}`;
  const verificationToken = crypto.createHmac("sha256", OTP_SECRET).update(hmacData).digest("hex");

  // Send SMS via Inforu
  const smsMessage = `קוד האימות שלך לטורניר בארי: ${code}`;
  const sender = INFORU_SENDER || "Beeri";

  const inforuUrl = new URL("https://api.inforu.co.il/inforufrontend/WebInterface/SendMessageByNumber.aspx");
  inforuUrl.searchParams.set("UserName", INFORU_USERNAME);
  inforuUrl.searchParams.set("ApiToken", INFORU_API_TOKEN);
  inforuUrl.searchParams.set("CellNumber", cleanPhone);
  inforuUrl.searchParams.set("MessageString", smsMessage);
  inforuUrl.searchParams.set("SenderName", sender);

  try {
    const smsRes = await fetch(inforuUrl.toString());
    const smsBody = await smsRes.text();
    // Inforu returns status code 1 for success
    if (!smsBody.includes("1") && !smsRes.ok) {
      console.error("Inforu SMS error:", smsBody);
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: "שליחת SMS נכשלה. נסה שוב" }) };
    }
  } catch (err) {
    console.error("Inforu fetch error:", err);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: "שגיאת רשת בשליחת SMS" }) };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: true,
      verificationToken,
      expiresAt,
    }),
  };
}
