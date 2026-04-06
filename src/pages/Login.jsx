import { useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useToast } from '../components/Toast';
import { signInWithGoogle, signInWithApple } from '../firebase';
import { ensureUserInStore } from '../store';

export default function Login() {
  const { navigate } = useNavigation();
  const showToast = useToast();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (provider) => {
    setLoading(true);
    setError('');
    try {
      const signIn = provider === 'google' ? signInWithGoogle : signInWithApple;
      const user = await signIn();
      const displayName = user.displayName || user.email?.split('@')[0] || 'משתמש';
      ensureUserInStore(user.uid, displayName);
      showToast(`ברוך הבא, ${displayName}!`);
      navigate('home');
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User cancelled — not an error
      } else if (err.code === 'auth/popup-blocked') {
        setError('החלון נחסם. אפשר חלונות קופצים בדפדפן');
      } else {
        setError('שגיאה בהתחברות. נסה שוב');
        console.error('Auth error:', err.code, err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center max-w-md mx-auto">
      <div className="py-8">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-xl font-bold text-primary mb-1">ברוכים הבאים!</h1>
        <p className="text-gray-500 text-sm">טורניר הניחושים של בארי – מונדיאל 2026</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
        <p className="text-xs text-gray-400 mb-1">התחבר כדי להשתתף</p>

        {/* Google */}
        <button
          onClick={() => handleSignIn('google')}
          disabled={loading}
          className="w-full bg-white text-gray-700 font-bold py-3.5 rounded-2xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition text-sm cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          התחבר עם Google
        </button>

        {/* Apple */}
        <button
          onClick={() => handleSignIn('apple')}
          disabled={loading}
          className="w-full bg-black text-white font-bold py-3.5 rounded-2xl hover:bg-gray-900 transition text-sm cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50 border-none"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          התחבר עם Apple
        </button>

        {error && <div className="text-sm text-red-500 mt-2">{error}</div>}

        {loading && <div className="text-xs text-gray-400 mt-2">מתחבר...</div>}
      </div>
    </div>
  );
}
