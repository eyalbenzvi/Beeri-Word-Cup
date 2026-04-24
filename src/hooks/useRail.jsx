// Context for pages to inject content into the desktop right-rail.
// Pages call useRightRail(<MyRail />) inside a useEffect to populate the rail;
// it auto-clears on unmount.
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const RailContext = createContext({ content: null, setContent: () => {} });

export function RailProvider({ children }) {
  const [content, setContentRaw] = useState(null);
  const setContent = useCallback((node) => setContentRaw(node), []);
  return (
    <RailContext.Provider value={{ content, setContent }}>
      {children}
    </RailContext.Provider>
  );
}

export function useRailContent() {
  return useContext(RailContext).content;
}

// Pages call this with their rail node. Passing null clears it.
export function useRightRail(node) {
  const { setContent } = useContext(RailContext);
  useEffect(() => {
    setContent(node);
    return () => setContent(null);
  }, [node, setContent]);
}
