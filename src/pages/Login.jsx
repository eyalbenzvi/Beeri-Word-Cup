import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, useUsers } from '../hooks/useStore';
import { findUserByPhone } from '../store';
import { auth } from '../firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

function formatPhoneE164(phone) {
  // Strip non-digits
  const digits = phone.replace(/\D/g, '');
  // Israeli number: 05x... → +972...
  if (digits.startsWith('0')) {
    return '+972' + digits.slice(1);
  }
  // Already has country code
  if (digits.startsWith('972')) {
    return '+' + digits;
  }
  return '+' + digits;
}

export default function Login() {
  const { login, addUser } = useCurrentUser();
  const users = useUsers();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | 'login' | 'register'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  const recaptchaContainerRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  const userList = Object.values(users);

  // Setup invisible recaptcha
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch {}
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  function getRecaptchaVerifier() {
    if (recaptchaVerifierRef.current) {
      try { recaptchaVerifierRef.current.clear(); } catch {}
    }
    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
      size: 'invisible',
    });
    return recaptchaVerifierRef.current;
  }

  const handleSendOtp = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (mode === 'register') {
      if (!trimmedName) { setError('הכנס שם משתמש'); return; }
      const exists = userList.some(
        (u) => u.displayName.toLowerCase() === trimmedName.toLowerCase()
      );
      if (exists) { setError('שם משתמש כבר קיים, בחר שם אחר'); return; }
    }

    if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 9) {
      setError('הכנס מספר טלפון תקין');
      return;
    }

    if (mode === 'login') {
      const found = findUserByPhone(trimmedPhone);
      if (!found) { setError('מספר טלפון לא רשום במערכת'); return; }
    }

    setLoading(true);
    setError('');

    try {
      const e164 = formatPhoneE164(trimmedPhone);
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, e164, verifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err) {
      console.error('SMS error:', err);
      if (err.code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות. נסה שוב מאוחר יותר');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('מספר טלפון לא תקין');
      } else {
        setError('שגיאה בשליחת SMS. נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 6) { setError('הכנס קוד בן 6 ספרות'); return; }

    setLoading(true);
    setError('');

    try {
      await confirmationResult.confirm(otp);

      if (mode === 'register') {
        const userId = addUser(name.trim(), phone.trim());
        login(userId);
      } else {
        const found = findUserByPhone(phone.trim());
        if (found) {
          login(found.id);
        } else {
          setError('מספר טלפון לא רשום במערכת');
          setLoading(false);
          return;
        }
      }
      navigate('/');
    } catch (err) {
      console.error('OTP error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('קוד שגוי, נסה שוב');
      } else {
        setError('שגיאה באימות. נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setMode(null);
    setStep('form');
    setName('');
    setPhone('');
    setOtp('');
    setError('');
    setConfirmationResult(null);
  };

  // OTP verification screen
  if (step === 'otp') {
    return (
      <div className="text-center">
        <div className="py-6">
          <div className="text-5xl mb-3">📱</div>
          <h1 className="text-xl font-bold text-primary mb-1">הכנס קוד אימות</h1>
          <p className="text-gray-500 text-sm">שלחנו SMS עם קוד ל-{phone}</p>
        </div>
        <form onSubmit={handleVerifyOtp} className="bg-white rounded-xl p-4 border border-gray-100">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="קוד בן 6 ספרות"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] font-bold focus:border-primary focus:outline-none mb-3"
            autoFocus
            dir="ltr"
          />
          {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={otp.length < 6 || loading}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition disabled:opacity-40"
          >
            {loading ? 'מאמת...' : 'אמת קוד'}
          </button>
          <button type="button" onClick={resetAll}
            className="mt-2 text-sm text-gray-500 hover:text-primary">
            חזרה →
          </button>
        </form>
        <div ref={recaptchaContainerRef} />
      </div>
    );
  }

  // Login or Register form
  if (mode) {
    const isLogin = mode === 'login';
    return (
      <div className="text-center">
        <div className="py-6">
          <div className="text-5xl mb-3">{isLogin ? '🔐' : '⚽'}</div>
          <h1 className="text-xl font-bold text-primary mb-1">
            {isLogin ? 'התחברות' : 'הרשמה'}
          </h1>
          <p className="text-gray-500 text-sm">
            {isLogin
              ? 'הכנס את מספר הטלפון שלך'
              : (userList.length === 0 ? 'השחקן הראשון הופך למנהל המשחק' : 'צור משתמש חדש')}
          </p>
        </div>
        <form onSubmit={handleSendOtp} className="bg-white rounded-xl p-4 border border-gray-100">
          {!isLogin && (
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="שם משתמש..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
              autoFocus
            />
          )}
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(''); }}
            placeholder="מספר טלפון (למשל 0501234567)"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
            dir="ltr"
            autoFocus={isLogin}
          />
          {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={(!isLogin && !name.trim()) || !phone.trim() || loading}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition disabled:opacity-40"
          >
            {loading ? 'שולח SMS...' : 'שלח קוד אימות'}
          </button>
          <button type="button" onClick={resetAll}
            className="mt-2 text-sm text-gray-500 hover:text-primary">
            חזרה →
          </button>
        </form>
        <div ref={recaptchaContainerRef} />
      </div>
    );
  }

  // Main screen — two buttons
  return (
    <div className="text-center">
      <div className="py-6">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-xl font-bold text-primary mb-1">ברוכים הבאים!</h1>
        <p className="text-gray-500 text-sm">טורניר הניחושים של בארי - מונדיאל 2026</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => { setMode('login'); setError(''); setPhone(''); }}
          className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base"
        >
          התחברות
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); setName(''); setPhone(''); }}
          className="w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary hover:bg-gray-50 transition text-base"
        >
          הרשמה
        </button>
      </div>
      <div ref={recaptchaContainerRef} />
    </div>
  );
}
