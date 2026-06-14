import { useState, useEffect } from "react";
import { KICKOFF_UTC, DAY_MS, HOUR_MS, MINUTE_MS } from "../utils/constants";

export function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, KICKOFF_UTC - now);
  return {
    days: Math.floor(diff / DAY_MS),
    hours: Math.floor((diff % DAY_MS) / HOUR_MS),
    minutes: Math.floor((diff % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((diff % MINUTE_MS) / 1000),
    started: diff === 0,
  };
}
