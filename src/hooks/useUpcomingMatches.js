import { useEffect, useMemo, useState } from "react";
import { ALL_MATCHES } from "../data/matches";
import { selectUpcomingMatches } from "../utils/upcomingMatches";
import { useMatchResults } from "./useStore";

// Re-evaluate the "now" clock once a minute — matches drop off the list
// after kickoff without needing per-second updates like the countdown.
const TICK_MS = 60_000;

export function useUpcomingMatches() {
  const matchResults = useMatchResults();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => selectUpcomingMatches(ALL_MATCHES, matchResults, now),
    [matchResults, now],
  );
}
