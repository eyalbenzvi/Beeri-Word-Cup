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
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `שליחת SMS נכשלה: ${smsBody.slice(0, 200)}` }),
      };
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
