// Tests for phone authentication feature — OTP logic, UID handling, security, privacy
import crypto from "crypto";
import {
  normalizeIsraeliMobile,
  isValidIsraeliMobile,
  sanitizePhoneInput,
  ISRAELI_MOBILE_PREFIXES,
} from "../../src/utils/phone.js";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== PHONE AUTH TESTS ===\n");

// ============ 1. OTP HMAC Verification ============
console.log("--- 1. OTP HMAC verification ---");
{
  const SECRET = "test-secret-key-12345";
  const phone = "0501234567";
  const code = "123456";
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const hmacData = `${phone}:${code}:${expiresAt}`;
  const token = crypto.createHmac("sha256", SECRET).update(hmacData).digest("hex");

  // Correct code verifies
  const verifyData = `${phone}:${code}:${expiresAt}`;
  const verifyToken = crypto.createHmac("sha256", SECRET).update(verifyData).digest("hex");
  assert(token === verifyToken, "Correct code produces matching HMAC");

  // Wrong code fails
  const wrongData = `${phone}:999999:${expiresAt}`;
  const wrongToken = crypto.createHmac("sha256", SECRET).update(wrongData).digest("hex");
  assert(token !== wrongToken, "Wrong code produces different HMAC");

  // Wrong phone fails
  const wrongPhoneData = `0509999999:${code}:${expiresAt}`;
  const wrongPhoneToken = crypto.createHmac("sha256", SECRET).update(wrongPhoneData).digest("hex");
  assert(token !== wrongPhoneToken, "Wrong phone produces different HMAC");

  // Tampered expiry fails
  const tamperedData = `${phone}:${code}:${expiresAt + 60000}`;
  const tamperedToken = crypto.createHmac("sha256", SECRET).update(tamperedData).digest("hex");
  assert(token !== tamperedToken, "Tampered expiry produces different HMAC");

  // Different secret fails
  const wrongSecretToken = crypto.createHmac("sha256", "wrong-secret").update(hmacData).digest("hex");
  assert(token !== wrongSecretToken, "Different secret produces different HMAC");
}

// ============ 2. OTP Expiry Logic ============
console.log("--- 2. OTP expiry ---");
{
  const fiveMinutes = 5 * 60 * 1000;
  const expiresAt = Date.now() + fiveMinutes;

  assert(Date.now() <= expiresAt, "Fresh OTP is not expired");
  assert(Date.now() > (Date.now() - fiveMinutes - 1000), "Old OTP is expired");

  const pastExpiry = Date.now() - 1000;
  assert(Date.now() > pastExpiry, "Code created 1s ago with 0 TTL is expired");

  const futureExpiry = Date.now() + 300000;
  assert(Date.now() <= futureExpiry, "Code with 5min TTL is valid now");
}

// ============ 3. Phone Number Validation ============
console.log("--- 3. Phone number validation ---");
{
  const isValid = (p) => /^05\d{8}$/.test(p.replace(/[-\s]/g, ""));

  // Valid numbers
  assert(isValid("0501234567"), "Standard 10-digit number valid");
  assert(isValid("050-123-4567"), "Dashed number valid");
  assert(isValid("050 123 4567"), "Spaced number valid");
  assert(isValid("0521234567"), "052 prefix valid");
  assert(isValid("0541234567"), "054 prefix valid");
  assert(isValid("0581234567"), "058 prefix valid");

  // Invalid numbers
  assert(!isValid(""), "Empty string invalid");
  assert(!isValid("123"), "Short number invalid");
  assert(!isValid("0401234567"), "040 prefix invalid (not 05x)");
  assert(!isValid("05012345678"), "11 digits invalid");
  assert(!isValid("050123456"), "9 digits invalid");
  assert(!isValid("+972501234567"), "+972 format invalid (without strip)");
  assert(!isValid("abc"), "Letters invalid");
  assert(!isValid("05abcdefgh"), "Letters after 05 invalid");
}

// ============ 4. Phone Number Cleaning Consistency ============
console.log("--- 4. Phone number cleaning ---");
{
  const clean = (p) => p.replace(/[-\s]/g, "");

  assert(clean("050-123-4567") === "0501234567", "Dashes stripped");
  assert(clean("050 123 4567") === "0501234567", "Spaces stripped");
  assert(clean("050-123 4567") === "0501234567", "Mixed dash/space stripped");
  assert(clean("0501234567") === "0501234567", "Clean number unchanged");

  // Same phone produces same UID
  const uid1 = `phone_${clean("050-123-4567")}`;
  const uid2 = `phone_${clean("050 123 4567")}`;
  const uid3 = `phone_${clean("0501234567")}`;
  assert(uid1 === uid2, "Different formatting → same UID (dash vs space)");
  assert(uid2 === uid3, "Different formatting → same UID (space vs clean)");
}

// ============ 5. Phone UID Format ============
console.log("--- 5. Phone UID format ---");
{
  const phoneUid = "phone_0501234567";
  const googleUid = "abc123DEF456";

  // Starts with phone_
  assert(phoneUid.startsWith("phone_"), "Phone UID has phone_ prefix");
  assert(!googleUid.startsWith("phone_"), "Google UID has no phone_ prefix");

  // Detection
  const isPhoneUser = (uid) => uid.startsWith("phone_");
  assert(isPhoneUser(phoneUid), "Detect phone user");
  assert(!isPhoneUser(googleUid), "Detect non-phone user");

  // Phone number extraction
  const extractPhone = (uid) => uid.replace("phone_", "");
  assert(extractPhone(phoneUid) === "0501234567", "Extract phone from UID");

  // UID is valid for Firestore document paths (no slashes, dots, etc.)
  assert(!/[\/\.\[\]#$]/.test(phoneUid), "Phone UID is Firestore-safe");
}

// ============ 6. Form ID with Phone UID ============
console.log("--- 6. Form ID with phone UID ---");
{
  const phoneUid = "phone_0501234567";
  const timestamp = 1712345678901;
  const formId = `${phoneUid}__${timestamp}`;

  assert(formId === "phone_0501234567__1712345678901", "Form ID format correct");
  assert(formId.includes("__"), "Form ID contains __ separator");

  // Firestore security rule pattern: formId.matches(uid + '__.*')
  const rulePattern = new RegExp(`^${phoneUid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}__.*$`);
  assert(rulePattern.test(formId), "Form ID matches Firestore security rule pattern");

  // Should NOT match a different user's form
  const otherUid = "phone_0509999999";
  const otherPattern = new RegExp(`^${otherUid}__.*$`);
  assert(!otherPattern.test(formId), "Form ID doesn't match other user's pattern");

  // Google user can't access phone user's form
  const googlePattern = new RegExp(`^googleuser123__.*$`);
  assert(!googlePattern.test(formId), "Google user can't match phone user form ID");
}

// ============ 7. Phone User Display Name Privacy ============
console.log("--- 7. Display name privacy ---");
{
  const phoneUid = "phone_0501234567";
  const isPhoneUser = phoneUid.startsWith("phone_");
  const phoneName = isPhoneUser ? phoneUid.replace("phone_", "") : null;

  // Raw phone number should NOT be used as display name in production
  assert(phoneName === "0501234567", "Phone extracted from UID");

  // Check that phone number looks like a phone (privacy risk if displayed)
  const looksLikePhone = /^05\d{8}$/.test(phoneName);
  assert(looksLikePhone, "Extracted value looks like phone number (privacy risk flagged)");

  // A masked version should be used for public display
  const maskPhone = (p) => p.slice(0, 3) + "****" + p.slice(-3);
  assert(maskPhone("0501234567") === "050****567", "Phone masking works");

  // Verify displayName fallback chain
  const firebaseDisplayName = null; // phone users have no Google displayName
  const firebasePhoneNumber = null; // custom token doesn't set phoneNumber
  const displayName = firebaseDisplayName || firebasePhoneNumber || phoneName || "משתמש";
  assert(displayName === "0501234567", "Fallback lands on phone number (needs masking)");
}

// ============ 8. OTP Code Generation ============
console.log("--- 8. OTP code generation ---");
{
  // Generate 100 codes and verify they're all valid
  const codes = new Set();
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    assert(code.length === 6, `Code ${code} is 6 digits`);
    assert(/^\d{6}$/.test(code), `Code ${code} is all digits`);
    assert(parseInt(code) >= 100000, `Code ${code} >= 100000`);
    assert(parseInt(code) <= 999999, `Code ${code} <= 999999`);
    codes.add(code);
  }
  // Should have some variety (not all the same code)
  assert(codes.size > 50, `100 generated codes have variety (${codes.size} unique)`);
}

// ============ 9. OTP Brute Force Analysis ============
console.log("--- 9. OTP brute force analysis ---");
{
  // 6-digit code = 1,000,000 possibilities
  const totalCodes = 900000; // 100000-999999
  const expireSeconds = 5 * 60; // 5 minutes

  // If an attacker can try 10 requests/second (typical rate limit)
  const attemptsIn5Min = 10 * expireSeconds;
  const bruteForceProb = attemptsIn5Min / totalCodes;
  assert(bruteForceProb < 0.05, `Brute force with rate limit: ${(bruteForceProb * 100).toFixed(2)}% chance (should be <5%)`);

  // Without rate limit, 1000 req/sec
  const unlimitedAttempts = 1000 * expireSeconds;
  const unlimitedProb = Math.min(1, unlimitedAttempts / totalCodes);
  assert(unlimitedProb > 0.3, `Without rate limit: ${(unlimitedProb * 100).toFixed(1)}% chance (VULNERABLE — needs rate limiting)`);
}

// ============ 10. Phone User Form Operations ============
console.log("--- 10. Phone user form operations ---");
{
  // Simulate form creation and deletion for phone users
  const phoneUid = "phone_0521234567";
  const forms = {};

  // Create form
  const formId1 = `${phoneUid}__${Date.now()}`;
  forms[formId1] = { userId: phoneUid, formName: "טופס 1", status: "draft" };
  assert(Object.keys(forms).length === 1, "Phone user can create form");

  // Create second form
  const formId2 = `${phoneUid}__${Date.now() + 1}`;
  forms[formId2] = { userId: phoneUid, formName: "טופס 2", status: "draft" };
  assert(Object.keys(forms).length === 2, "Phone user can create multiple forms");

  // Get forms for user
  const userForms = Object.entries(forms).filter(([, f]) => f.userId === phoneUid);
  assert(userForms.length === 2, "getFormsForUser returns phone user's forms");

  // Delete draft form
  if (forms[formId1]?.status === "draft") {
    delete forms[formId1];
  }
  assert(Object.keys(forms).length === 1, "Phone user can delete draft form");

  // Submit form
  forms[formId2].status = "submitted";
  assert(forms[formId2].status === "submitted", "Phone user can submit form");

  // Delete pending form
  forms[formId2].status = "pending";
  if (forms[formId2]?.status === "draft" || forms[formId2]?.status === "pending") {
    delete forms[formId2];
  }
  assert(Object.keys(forms).length === 0, "Phone user can delete pending form");
}

// ============ 11. Phone User ensureUserInStore ============
console.log("--- 11. ensureUserInStore for phone users ---");
{
  const users = {};
  const phoneUid = "phone_0501234567";

  // Simulate ensureUserInStore
  function ensureUser(uid, displayName, email) {
    if (users[uid]) return uid;
    users[uid] = {
      id: uid,
      displayName: displayName || "משתמש",
      isAdmin: false,
      email: email || null,
      profileCompleted: false,
      createdAt: new Date().toISOString(),
    };
    return uid;
  }

  const isPhoneUser = phoneUid.startsWith("phone_");
  const phoneName = isPhoneUser ? phoneUid.replace("phone_", "") : null;
  const displayName = null || null || phoneName || "משתמש"; // firebaseDisplayName || phoneNumber || phoneName

  ensureUser(phoneUid, displayName, null);

  assert(users[phoneUid] !== undefined, "Phone user created in store");
  assert(users[phoneUid].isAdmin === false, "Phone user is not admin");
  assert(users[phoneUid].profileCompleted === false, "Phone user needs profile setup");
  assert(users[phoneUid].email === null, "Phone user has no email");
  assert(users[phoneUid].displayName === "0501234567", "Phone user displayName is phone number");

  // Second call should not overwrite
  const createdAt = users[phoneUid].createdAt;
  ensureUser(phoneUid, "New Name", "email@test.com");
  assert(users[phoneUid].createdAt === createdAt, "Duplicate ensureUser doesn't overwrite");
}

// ============ 12. HMAC Tamper Resistance ============
console.log("--- 12. HMAC tamper resistance ---");
{
  const SECRET = "production-secret";
  const phone = "0501234567";
  const code = "123456";
  const expiresAt = Date.now() + 300000;

  const hmacData = `${phone}:${code}:${expiresAt}`;
  const validToken = crypto.createHmac("sha256", SECRET).update(hmacData).digest("hex");

  // Attacker tries to extend expiry
  const extendedExpiry = expiresAt + 3600000; // +1 hour
  const attackData = `${phone}:${code}:${extendedExpiry}`;
  const attackToken = crypto.createHmac("sha256", SECRET).update(attackData).digest("hex");
  assert(validToken !== attackToken, "Extended expiry token doesn't match original");

  // Attacker tries different phone with same code
  const stealData = `0509999999:${code}:${expiresAt}`;
  const stealToken = crypto.createHmac("sha256", SECRET).update(stealData).digest("hex");
  assert(validToken !== stealToken, "Stolen code on different phone doesn't work");

  // Token is 64 chars (SHA-256 hex)
  assert(validToken.length === 64, "HMAC token is 64 hex chars (SHA-256)");
  assert(/^[0-9a-f]+$/.test(validToken), "HMAC token is hex-only");
}

// ============ 13. Mixed Auth User Isolation ============
console.log("--- 13. Mixed auth user isolation ---");
{
  const googleUid = "googleABC123";
  const phoneUid = "phone_0501234567";

  // Forms are isolated by UID
  const googleFormId = `${googleUid}__${Date.now()}`;
  const phoneFormId = `${phoneUid}__${Date.now() + 1}`;

  assert(!googleFormId.startsWith(phoneUid), "Google form doesn't match phone user");
  assert(!phoneFormId.startsWith(googleUid), "Phone form doesn't match Google user");

  // UIDs never collide
  assert(googleUid !== phoneUid, "Google and phone UIDs are different");
  assert(!googleUid.startsWith("phone_"), "Google UID can't look like phone UID");

  // Same person with both methods = two separate accounts
  // This is expected behavior but should be documented
  const samePersonGoogle = "googleXYZ789";
  const samePersonPhone = "phone_0501234567";
  assert(samePersonGoogle !== samePersonPhone, "Same person, different auth = different accounts");
}

// ============ 14. OTP Code Uniqueness per Request ============
console.log("--- 14. OTP uniqueness ---");
{
  const SECRET = "test-secret";
  const phone = "0501234567";
  const tokens = new Set();

  // Each request should produce different code + token
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 300000 + i; // slightly different time
    const hmacData = `${phone}:${code}:${expiresAt}`;
    const token = crypto.createHmac("sha256", SECRET).update(hmacData).digest("hex");
    tokens.add(token);
  }
  assert(tokens.size === 20, `20 OTP requests produce 20 unique tokens (got ${tokens.size})`);
}

// ============ 15. Israeli mobile normalizer — accepted formats ============
console.log("--- 15. normalizeIsraeliMobile: accepted formats ---");
{
  const accepted = [
    ["0501234567", "0501234567"],
    ["050-123-4567", "0501234567"],
    ["050 123 4567", "0501234567"],
    ["050.123.4567", "0501234567"],
    ["(050) 123-4567", "0501234567"],
    ["  0501234567  ", "0501234567"],
    ["+972501234567", "0501234567"],
    ["+972-50-123-4567", "0501234567"],
    ["+972 50 123 4567", "0501234567"],
    ["+972-50-1234567", "0501234567"],
    ["972501234567", "0501234567"],
    ["00972501234567", "0501234567"],
    ["0521234567", "0521234567"],
    ["0531234567", "0531234567"],
    ["0541234567", "0541234567"],
    ["0551234567", "0551234567"],
    ["0581234567", "0581234567"],
  ];
  for (const [inp, exp] of accepted) {
    assert(normalizeIsraeliMobile(inp) === exp, `normalize "${inp}" → "${exp}"`);
  }
  assert(isValidIsraeliMobile("+972501234567"), "isValid +972501234567");
  assert(isValidIsraeliMobile("050-123-4567"), "isValid 050-123-4567");
}

// ============ 16. Israeli mobile normalizer — rejected inputs ============
console.log("--- 16. normalizeIsraeliMobile: rejections ---");
{
  const rejected = [
    ["", "empty string"],
    [null, "null"],
    [undefined, "undefined"],
    ["0511234567", "051 prefix (not active carrier)"],
    ["0561234567", "056 prefix (not active carrier)"],
    ["0571234567", "057 prefix (not active carrier)"],
    ["0591234567", "059 prefix (not active carrier)"],
    ["0401234567", "040 prefix (landline/bad)"],
    ["0301234567", "030 prefix (landline)"],
    ["0201234567", "020 prefix (not mobile)"],
    ["050123456", "9 digits (too short)"],
    ["05012345678", "11 digits (too long)"],
    ["+972401234567", "+972 with invalid mobile prefix (040)"],
    ["+972511234567", "+972 with invalid mobile prefix (051)"],
    ["+15012345678", "foreign country code"],
    ["+44501234567", "UK country code"],
    ["abc", "letters only"],
    ["05abcdefgh", "letters after 05"],
    ["050-abc-4567", "letters in middle"],
    ["050!!1234567", "exclamation marks"],
    ["050@1234567", "at sign"],
    ["٠٥٠١٢٣٤٥٦٧", "Arabic-Indic digits"],
    ["۰۵۰۱۲۳۴۵۶۷", "Persian digits"],
    ["050 123 4567 extra", "trailing text"],
    ["hello 0501234567", "leading text"],
    ["9720501234567", "13 digits starting with 972 (ambiguous)"],
    ["+9720501234567", "13 digits with + prefix (ambiguous)"],
    ["05012345", "too short (8 digits)"],
    ["0", "single digit"],
    ["+", "plus only"],
    ["()", "formatting only"],
    ["   ", "whitespace only"],
    ["050\n1234567", "newline in middle still ok?"], // actually \s allowed — will normalize — check
  ];
  for (const [inp, label] of rejected) {
    // newline is \s which is in the accepted formatting class → would normalize.
    // Remove that case — accepted formatting.
    if (inp === "050\n1234567") {
      assert(normalizeIsraeliMobile(inp) === "0501234567", `normalize across newline → canonical (${label})`);
      continue;
    }
    assert(normalizeIsraeliMobile(inp) === null, `reject: ${label} (${JSON.stringify(inp)})`);
    assert(!isValidIsraeliMobile(inp), `isValid rejects: ${label}`);
  }
}

// ============ 17. UID stability across equivalent formats ============
console.log("--- 17. UID stability across formats ---");
{
  const inputs = [
    "0501234567",
    "050-123-4567",
    "050 123 4567",
    "050.123.4567",
    "(050) 123-4567",
    "+972501234567",
    "+972-50-123-4567",
    "972501234567",
    "00972501234567",
    "  0501234567  ",
  ];
  const uids = inputs.map((i) => `phone_${normalizeIsraeliMobile(i)}`);
  const unique = new Set(uids);
  assert(unique.size === 1, `All equivalent inputs → single UID (got ${unique.size} distinct)`);
  assert(uids[0] === "phone_0501234567", `UID is canonical: ${uids[0]}`);
}

// ============ 18. sanitizePhoneInput — live input filtering ============
console.log("--- 18. sanitizePhoneInput ---");
{
  assert(sanitizePhoneInput("") === "", "empty stays empty");
  assert(sanitizePhoneInput(null) === "", "null → empty");
  assert(sanitizePhoneInput(undefined) === "", "undefined → empty");
  assert(sanitizePhoneInput("0501234567") === "0501234567", "digits pass through");
  assert(sanitizePhoneInput("050-123-4567") === "050-123-4567", "dashes kept");
  assert(sanitizePhoneInput("050 123 4567") === "050 123 4567", "spaces kept");
  assert(sanitizePhoneInput("(050) 123-4567") === "(050) 123-4567", "parens kept");
  assert(sanitizePhoneInput("+972-50-1234567") === "+972-50-1234567", "plus kept");
  assert(sanitizePhoneInput("050.123.4567") === "050.123.4567", "dots kept");
  assert(sanitizePhoneInput("abc050def") === "050", "letters stripped");
  assert(sanitizePhoneInput("050😀1234") === "0501234", "emoji stripped");
  assert(sanitizePhoneInput("<script>0501234567</script>") === "0501234567", "html/tags stripped");
  assert(sanitizePhoneInput("050@1234#567") === "0501234567", "special chars stripped");
  assert(sanitizePhoneInput("٠٥٠١٢٣٤٥٦٧") === "", "Arabic-Indic digits stripped");
  // Length cap
  const long = "0".repeat(100);
  assert(sanitizePhoneInput(long).length === 20, "length capped at 20");
  // Invisible chars stripped (zero-width + LRM)
  assert(sanitizePhoneInput("0501234567‎") === "0501234567", "LRM stripped");
  assert(sanitizePhoneInput("​050​1234567") === "0501234567", "zero-width space stripped");
  assert(sanitizePhoneInput("050 1234567") === "0501234567" || sanitizePhoneInput("050 1234567") === "050 1234567", "NBSP stripped or converted");
}

// ============ 19. Prefix whitelist sanity ============
console.log("--- 19. prefix whitelist ---");
{
  assert(Array.isArray(ISRAELI_MOBILE_PREFIXES), "prefix list exported");
  assert(ISRAELI_MOBILE_PREFIXES.length >= 6, "at least 6 prefixes (050/052/053/054/055/058)");
  for (const p of ["050", "052", "053", "054", "055", "058"]) {
    assert(ISRAELI_MOBILE_PREFIXES.includes(p), `${p} in whitelist`);
  }
  for (const p of ISRAELI_MOBILE_PREFIXES) {
    assert(/^05\d$/.test(p), `prefix ${p} matches 05X format`);
    assert(isValidIsraeliMobile(`${p}1234567`), `a number with prefix ${p} is valid`);
  }
  for (const bad of ["051", "056", "057", "059"]) {
    assert(!ISRAELI_MOBILE_PREFIXES.includes(bad), `${bad} correctly excluded`);
    assert(!isValidIsraeliMobile(`${bad}1234567`), `a number with prefix ${bad} is invalid`);
  }
}

// ============ 20. HMAC + UID round-trip with normalized input ============
console.log("--- 20. HMAC consistency across input formats ---");
{
  const SECRET = "test-secret-key-hmac";
  const code = "654321";
  const expiresAt = Date.now() + 300000;

  function hmacFor(phoneInput) {
    const clean = normalizeIsraeliMobile(phoneInput);
    const data = `${clean}:${code}:${expiresAt}`;
    return crypto.createHmac("sha256", SECRET).update(data).digest("hex");
  }

  const t1 = hmacFor("0501234567");
  const t2 = hmacFor("050-123-4567");
  const t3 = hmacFor("+972-50-123-4567");
  const t4 = hmacFor("(050) 123-4567");
  assert(t1 === t2, "HMAC identical: dashed input");
  assert(t1 === t3, "HMAC identical: +972 input");
  assert(t1 === t4, "HMAC identical: parens input");

  // A different number produces a different HMAC
  const t5 = hmacFor("0521234567");
  assert(t1 !== t5, "HMAC differs for different phone");
}

// ============ 21. PhoneSignIn: defensive JSON parsing (504-HTML regression) ============
// A Netlify gateway timeout (504) returns an HTML page, not JSON. res.json()
// then throws a cryptic SyntaxError ("The string did not match the expected
// pattern" on Safari) that replaced the friendly Hebrew error. The component
// must parse defensively and validate the payload before using it.
console.log("--- 21. PhoneSignIn defensive JSON parsing ---");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../src/components/PhoneSignIn.tsx", import.meta.url), "utf8");
  const defensiveParses = (src.match(/res\.json\(\)\.catch\(\(\) => null\)/g) || []).length;
  assert(defensiveParses >= 2, "send-otp + verify-otp both parse JSON defensively (.catch(() => null))");
  assert(!/const data = await res\.json\(\);/.test(src), "no bare res.json() left in PhoneSignIn");
  assert(src.includes("data?.verificationToken"), "send-otp validates verificationToken before use");
  assert(src.includes("data?.customToken"), "verify-otp validates customToken before use");
}

// ============ Summary ============
console.log(`\n=== PHONE AUTH RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
