// Shared HTTP helpers for the result/live-score source clients.
//
// Every source (football-data, api-sports, ESPN live + ESPN result) needs the
// same two primitives: an abortable JSON GET with a timeout, and a +/-1 day
// window around an instant (to absorb timezone skew between Israel kickoff
// times and the UTC dates the APIs key on). Keeping them here means one place
// to fix a timeout/encoding bug instead of four copies drifting apart.

const DEFAULT_TIMEOUT_MS = 3500;

// Abortable JSON GET. Throws on non-2xx or timeout; callers soft-degrade.
export async function getJson(url, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ISO YYYY-MM-DD bounds for [ms - 1 day, ms + 1 day]. football-data / api-sports
// take these directly; ESPN wants them compacted to YYYYMMDD (caller strips
// the dashes).
export function dayWindow(ms) {
  const from = new Date(ms - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(ms + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { from, to };
}
