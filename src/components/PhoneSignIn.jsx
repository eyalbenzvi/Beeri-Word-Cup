import { useState, useRef, useEffect } from "react";
import { useToast } from "./Toast";
import { signInWithPhoneOtp } from "../firebase";
import { captureClientError } from "../sentry";

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

  const handleSendOtp = async () => {
    const cleanPhone = phone.replace(/[-\s]/g, "");
    if (!/^05\d{8}$/.test(cleanPhone)) {
      setError("מספר טלפון לא תקין (05XXXXXXXX)");
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
      const cleanPhone = phone.replace(/[-\s]/g, "");
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
          <label className="text-xs font-semibold text-ink-muted block mb-1">מספר טלפון</label>
          <input
            type="tel"
            inputMode="numeric"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            className="w-full px-4 py-3.5 border-2 border-border rounded-2xl text-base text-center focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleSendOtp}
          disabled={loading || !phone.trim()}
          className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-sm border-none cursor-pointer shadow-sm disabled:opacity-50"
        >
          {loading ? "שולח קוד..." : "שלח קוד אימות ב-SMS"}
        </button>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted text-center">
        קוד אימות נשלח ל-<span dir="ltr" className="font-semibold">{phone}</span>
      </p>
      <div>
        <input
          ref={codeInputRef}
          type="text"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="______"
          className="w-full px-4 py-3.5 border-2 border-border rounded-2xl text-2xl text-center font-mono tracking-[0.5em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          disabled={loading}
        />
      </div>
      <button
        onClick={handleVerifyCode}
        disabled={loading || code.length !== 6}
        className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-sm border-none cursor-pointer shadow-sm disabled:opacity-50"
      >
        {loading ? "מאמת..." : "אמת קוד"}
      </button>
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setStep("phone"); setCode(""); setError(""); }}
          className="text-xs text-primary bg-transparent border-none cursor-pointer p-0"
        >
          שינוי מספר
        </button>
        <button
          onClick={handleSendOtp}
          disabled={cooldown > 0 || loading}
          className="text-xs text-primary bg-transparent border-none cursor-pointer p-0 disabled:text-gray-300"
        >
          {cooldown > 0 ? `שלח שוב (${cooldown}s)` : "שלח קוד חדש"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  );
}
