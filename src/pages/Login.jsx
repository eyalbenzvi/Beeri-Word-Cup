import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, useUsers } from '../hooks/useStore';

export default function Login() {
  const { login, addUser } = useCurrentUser();
  const users = useUsers();
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');
  const [formName, setFormName] = useState('');
  const [budgetNumber, setBudgetNumber] = useState('');
  const [showNew, setShowNew] = useState(false);

  const userList = Object.values(users);

  const handleSelectUser = (userId) => {
    login(userId);
    navigate('/');
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !formName.trim() || !budgetNumber.trim()) return;
    const userId = addUser(name, formName.trim(), budgetNumber.trim());
    login(userId);
    navigate('/');
  };

  return (
    <div className="text-center">
      <div className="py-6">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-xl font-bold text-primary mb-1">Welcome!</h1>
        <p className="text-gray-500 text-sm">Choose your name or create a new player</p>
      </div>

      {/* Existing users */}
      {userList.length > 0 && !showNew && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wide">
            Select Your Name
          </h2>
          <div className="space-y-2">
            {userList.map((u) => (
              <button
                key={u.id}
                onClick={() => handleSelectUser(u.id)}
                className="w-full bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-lg font-bold">
                  {u.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{u.displayName}</div>
                  {u.isAdmin && (
                    <span className="text-xs text-primary">Admin</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add new user */}
      {showNew || userList.length === 0 ? (
        <form onSubmit={handleCreateUser} className="bg-white rounded-xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            {userList.length === 0 ? 'Create First Player (Admin)' : 'New Player'}
          </h2>
          {userList.length === 0 && (
            <p className="text-xs text-gray-400 mb-3">
              The first player becomes the game admin
            </p>
          )}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם מלא..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
            autoFocus
          />
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="שם הטופס (יוצג בטבלה)..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
          />
          <input
            type="text"
            value={budgetNumber}
            onChange={(e) => setBudgetNumber(e.target.value)}
            placeholder="מספר תקציב לחיוב..."
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-primary focus:outline-none mb-3"
          />
          <button
            type="submit"
            disabled={!newName.trim() || !formName.trim() || !budgetNumber.trim()}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition disabled:opacity-40"
          >
            {userList.length === 0 ? 'Create Game & Join' : 'Join Game'}
          </button>
          {userList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="mt-2 text-sm text-gray-500 hover:text-primary"
            >
              ← Back to player list
            </button>
          )}
        </form>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="w-full bg-white text-primary font-semibold py-3 rounded-xl border-2 border-primary hover:bg-gray-50 transition"
        >
          + Add New Player
        </button>
      )}
    </div>
  );
}
