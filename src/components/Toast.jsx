import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [exiting, setExiting] = useState(false);

  const showToast = useCallback((message, type = 'success') => {
    setExiting(false);
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => { setToast(null); setExiting(false); }, 300);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-primary',
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl text-white text-sm font-medium shadow-lg ${colors[toast.type] || colors.success} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
