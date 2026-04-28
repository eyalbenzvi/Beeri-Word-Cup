import { useState, useRef, useEffect } from "react";
import { useToast } from "./Toast";
import { signInWithPhoneOtp } from "../firebase";
import { captureClientError } from "../sentry";
import { normalizeIsraeliMobile, sanitizePhoneInput } from "../utils/phone";
import InlineError from "./InlineError";

export default function PhoneSignIn() {
  const showToast = useToast();
  const [step, setStep] = useState("phone"); // "phone" | "code"
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpData, setOtpData] = useState(null); // { verificationToken, expiresAt }
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Web OTP API (Chrome on Android): auto-fill the SMS code when it arrives.
  // iOS Safari handles auto-fill via autocomplete="one-time-code" on the input.
  useEffect(() => {
    if (step !== "code") return;
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    // WebOTP API — `otp` is a non-standard credential descriptor not in
    // the lib.dom.d.ts CredentialRequestOptions type yet. Cast to any.
    (navigator.credentials as any)
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((cred: any) => {
        const otp = cred?.code?.replace(/\D/g, "").slice(0, 6);
        if (otp && otp.length === 6) setCode(otp);
      })
      .catch(() => {
        // User dismissed the prompt or no SMS arrived — silent.
      });
    return () => ac.abort();
  }, [step]);

  const handleSendOtp = async () => {
    const cleanPhone = normalizeIsraeliMobile(phone);
    if (!cleanPhone) {
      setError("מספר נייד ישראלי לא תקין (למשל 050-1234567 או ‎+972-50-1234567)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/.netlify/functions/phone-send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחת SMS");
      setOtpData({ verificationToken: data.verificationToken, expiresAt: data.expiresAt });
      setStep("code");
      setCooldown(60);
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
      captureClientError(err, { source: "PhoneSignIn.sendOtp" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError("הקוד חייב להיות 6 ספרות");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cleanPhone = normalizeIsraeliMobile(phone);
      if (!cleanPhone) {
        setError("מספר נייד ישראלי לא תקין");
        setLoading(false);
        return;
      }
      const res = await fetch("/.netlify/functions/phone-verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          code,
          verificationToken: otpData.verificationToken,
          expiresAt: otpData.expiresAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "אימות נכשל");
      await signInWithPhoneOtp(data.customToken);
      showToast("ברוך הבא! 📱");
    } catch (err) {
      setError(err.message);
      captureClientError(err, { source: "PhoneSignIn.verifyCode" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "phone") {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs font-extrabold text-ink block mb-1">מספר טלפון</label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            placeholder="050-1234567"
            maxLength={20}
            className="input-duo text-center"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleSendOtp}
          disabled={loading || !phone.trim()}
          className="btn-duo btn-duo-primary w-full"
        >
          {loading ? "שולח קוד..." : "שלח קוד אימות ב-SMS"}
        </button>
        <InlineError align="center">{error}</InlineError>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted text-center font-medium">
        קוד אימות נשלח ל-<span dir="ltr" className="font-extrabold text-ink">{phone}</span>
      </p>
      <div>
        <input
          ref={codeInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          name="otp"
          dir="ltr"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="______"
          className="input-duo text-2xl text-center font-mono tracking-[0.5em]"
          disabled={loading}
        />
      </div>
      <button
        onClick={handleVerifyCode}
        disabled={loading || code.length !== 6}
        className="btn-duo btn-duo-primary w-full"
      >
        {loading ? "מאמת..." : "אמת קוד"}
      </button>
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setStep("phone"); setCode(""); setError(""); }}
          className="text-sm text-secondary bg-transparent border-none cursor-pointer p-0 font-extrabold"
        >
          שינוי מספר
        </button>
        <button
          onClick={handleSendOtp}
          disabled={cooldown > 0 || loading}
          className="text-sm text-secondary bg-transparent border-none cursor-pointer p-0 disabled:text-ink-light font-extrabold"
        >
          {cooldown > 0 ? `שלח שוב (${cooldown}s)` : "שלח קוד חדש"}
        </button>
      </div>
      <InlineError align="center">{error}</InlineError>
    </div>
  );
}
