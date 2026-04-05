import { useState } from 'react';
import { useCurrentUser, useUsers } from '../hooks/useStore';
import { verifyPassword } from '../store';
import { useNavigation } from '../hooks/useNavigation';

export default function Login() {
  const { login, addUser } = useCurrentUser();
  const users = useUsers();
  const { navigate } = useNavigation();
  const [mode, setMode] = useState(null); // null | 'login' | 'register'
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const userList = Object.values(users);

  const handleLogin = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !password) return;

    const found = userList.find(
      (u) => u.displayName.toLowerCase() === trimmed.toLowerCase()
    );
    if (!found) {
      setError('שם משתמש לא קיים');
      return;
    }
    if (!verifyPassword(found.id, password)) {
      setError('סיסמא שגויה');
      return;
    }
    login(found.id);
    navigate('home');
  };

  const handleRegister = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !password) return;

    const exists = userList.some(
      (u) => u.displayName.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError('שם משתמש כבר קיים, בחר שם אחר');
      return;
    }

    const userId = addUser(trimmed, password);
    login(userId);
    navigate('home');
  };

  const resetAll = () => {
    setMode(null);
    setName('');
    setPassword('');
    setError('');
  };

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
            {isLogin ? 'הכנס את פרטי המשתמש שלך' : (userList.length === 0 ? 'השחקן הראשון הופך למנהל המשחק' : 'צור משתמש חדש')}
          </p>
        </div>
        <form onSubmit={isLogin ? handleLogin : handleRegister} className="bg-white rounded-xl p-4 border border-gray-100">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="שם משתמש..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="סיסמא..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
          />
          {error && (
            <div className="text-sm text-red-500 mb-3">{error}</div>
          )}
          <button
            type="submit"
            disabled={!name.trim() || !password}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition disabled:opacity-40"
          >
            {isLogin ? 'התחבר' : (userList.length === 0 ? 'צור משחק והצטרף' : 'הרשם')}
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="mt-2 text-sm text-gray-500 hover:text-primary"
          >
            חזרה →
          </button>
        </form>
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
          onClick={() => { setMode('login'); setError(''); setName(''); setPassword(''); }}
          className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition text-base"
        >
          התחברות
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); setName(''); setPassword(''); }}
          className="w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary hover:bg-gray-50 transition text-base"
        >
          הרשמה
        </button>
      </div>
    </div>
  );
}
