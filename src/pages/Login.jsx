import { useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useToast } from '../components/Toast';
import { signInWithGoogle, sendPhoneOTP } from '../firebase';
import { ensureUserInStore } from '../store';

export default function Login() {
  const { navigate } = useNavigation();
  const showToast = useToast();
  const [mode, setMode] = useState(null); // null | 'phone'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatPhone = (input) => {
    let num = input.replace(/[^\d+]/g, '');
    if (num.startsWith('05')) num = '+972' + num.slice(1);
    if (num.startsWith('5')) num = '+972' + num;
    return num;
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const user = await signInWithGoogle();
      ensureUserInStore(user.uid, user.displayName || user.email?.split('@')[0] || 'משתמש');
      showToast(`ברוך הבא, ${user.displayName || 'משתמש'}!`);
      navigate('home');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('שגיאה בהתחברות עם Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    try {
      const formatted = formatPhone(phone);
      if (!formatted.startsWith('+972') || formatted.length < 13) {
        setError('מספר טלפון לא תקין');
        setLoading(false);
        return;
      }
      const confirmation = await sendPhoneOTP(formatted);
      setConfirmationResult(confirmation);
    } catch (err) {
      console.error('OTP error:', err);
      if (err.code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות. נסה שוב מאוחר יותר');
      } else {
        setError('שגיאה בשליחת SMS. נסה שוב');
      }
      // Reset recaptcha on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp.trim() || !confirmationResult) return;
    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      ensureUserInStore(user.uid, user.phoneNumber || 'משתמש');
      showToast('התחברת בהצלחה!');
      navigate('home');
    } catch (err) {
      if (err.code === 'auth/invalid-verification-code') {
        setError('קוד לא נכון');
      } else {
        setError('שגיאה באימות. נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  // OTP verification step
  if (confirmationResult) {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="py-6">
          <div className="text-5xl mb-3">📱</div>
          <h1 className="text-xl font-bold text-primary mb-1">הכנס קוד אימות</h1>
          <p className="text-gray-500 text-sm">שלחנו SMS עם קוד ל-{phone}</p>
        </div>
        <form onSubmit={handleVerifyOTP} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            placeholder="קוד בן 6 ספרות"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] font-bold focus:border-primary focus:outline-none mb-3"
            autoFocus
            maxLength={6}
          />
          {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={otp.length < 6 || loading}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition disabled:opacity-40 border-none cursor-pointer shadow-sm text-base"
          >
            {loading ? 'מאמת...' : 'אימות'}
          </button>
          <button
            type="button"
            onClick={() => { setConfirmationResult(null); setOtp(''); setError(''); }}
            className="mt-3 text-sm text-gray-500 hover:text-primary bg-transparent border-none cursor-pointer"
          >
            שלח קוד חדש →
          </button>
        </form>
      </div>
    );
  }

  // Phone number entry
  if (mode === 'phone') {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="py-6">
          <div className="text-5xl mb-3">📞</div>
          <h1 className="text-xl font-bold text-primary mb-1">התחברות עם טלפון</h1>
          <p className="text-gray-500 text-sm">נשלח לך קוד אימות ב-SMS</p>
        </div>
        <form onSubmit={handleSendOTP} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(''); }}
            placeholder="054-1234567"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3 text-center"
            dir="ltr"
            autoFocus
          />
          {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
          <button
            type="submit"
            disabled={!phone.trim() || loading}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition disabled:opacity-40 border-none cursor-pointer shadow-sm text-base"
          >
            {loading ? 'שולח...' : 'שלח קוד אימות'}
          </button>
          <button
            type="button"
            onClick={() => { setMode(null); setPhone(''); setError(''); }}
            className="mt-3 text-sm text-gray-500 hover:text-primary bg-transparent border-none cursor-pointer"
          >
            חזרה →
          </button>
        </form>
        <div id="recaptcha-container" />
      </div>
    );
  }

  // Main screen — choose method
  return (
    <div className="text-center max-w-md mx-auto">
      <div className="py-6">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-xl font-bold text-primary mb-1">ברוכים הבאים!</h1>
        <p className="text-gray-500 text-sm">טורניר הניחושים של בארי – מונדיאל 2026</p>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white text-gray-700 font-bold py-3.5 rounded-2xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition text-base cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          התחבר עם Google
        </button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">או</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          onClick={() => setMode('phone')}
          className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl hover:bg-primary-light transition text-base border-none cursor-pointer shadow-sm flex items-center justify-center gap-2"
        >
          📱 התחבר עם מספר טלפון
        </button>
      </div>
    </div>
  );
}
