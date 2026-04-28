// Context for pages to inject content into the desktop right-rail.
// Pages call useRightRail(<MyRail />) inside a useEffect to populate the rail;
// it auto-clears on unmount.
import { createContext, useContext, useState, useEffect, useCallback } from "react";

type RailContextValue = {
  content: any;
  setContent: (node: any) => void;
};
const RailContext = createContext<RailContextValue>({ content: null, setContent: () => {} });

export function RailProvider({ children }: { children: any }) {
  const [content, setContentRaw] = useState<any>(null);
  const setContent = useCallback((node: any) => setContentRaw(node), []);
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
export function useRightRail(node: any) {
  const { setContent } = useContext(RailContext);
  useEffect(() => {
    setContent(node);
    return () => setContent(null);
  }, [node, setContent]);
}
