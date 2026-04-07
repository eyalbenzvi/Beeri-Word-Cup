import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const NavigationContext = createContext();

export function NavigationProvider({ children }) {
  const [page, setPage] = useState('home');

  const navigate = useCallback((p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const value = useMemo(() => ({ page, navigate }), [page, navigate]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
