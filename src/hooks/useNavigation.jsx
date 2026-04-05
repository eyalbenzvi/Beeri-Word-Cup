import { createContext, useContext, useState, useCallback } from 'react';

const NavigationContext = createContext();

export function NavigationProvider({ children }) {
  const [page, setPage] = useState('home');

  const navigate = useCallback((p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <NavigationContext.Provider value={{ page, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
