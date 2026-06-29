// Outright "to win the World Cup" odds → implied champion probabilities per
// team code. OPTIONAL + experimental: it powers the scenario simulator's
// betting calibration layer, which blends these into the Elo model. The whole
// feature soft-degrades — no API key, a fetch error, or an unmatched team name
// all just yield fewer (or zero) entries, and the simulator falls back to pure
// Elo. Never 500s.
//
// Why outright (not per-match) odds: a full-tournament Monte-Carlo needs a
// strength signal for matchups that don't exist yet (future knockout pairings),
// so only the team-level outright market is usable.
//
// Config (Netlify env): ODDS_API_KEY (the-odds-api.com), optional
// ODDS_API_SPORT (default soccer_fifa_world_cup_winner),
// BETTING_ODDS_DISABLED=true to hard-off.

import { buildCorsHeaders, resolveAllowedOrigins } from "./_lib/cors.js";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL_MS = 10 * 60 * 1000; // odds move slowly; 10 min is plenty
let cached = null; // { at, payload }
let inFlight = null;

// English team name (lowercased) → our team code. Best-effort; unmatched names
// are simply dropped (those teams stay on pure Elo).
const NAME_TO_CODE = {
  argentina: "ARG", spain: "ESP", france: "FRA", netherlands: "NED", brazil: "BRA",
  england: "ENG", portugal: "POR", colombia: "COL", uruguay: "URU", germany: "GER",
  belgium: "BEL", croatia: "CRO", morocco: "MAR", senegal: "SEN", japan: "JPN",
  switzerland: "SUI", ecuador: "ECU", turkey: "TUR", "türkiye": "TUR", austria: "AUT",
  norway: "NOR", mexico: "MEX", iran: "IRN", "usa": "USA", "united states": "USA",
  "south korea": "KOR", "korea republic": "KOR", sweden: "SWE", "ivory coast": "CIV",
  "côte d'ivoire": "CIV", algeria: "ALG", canada: "CAN", paraguay: "PAR",
  "czech republic": "CZE", czechia: "CZE", australia: "AUS", egypt: "EGY",
  "bosnia and herzegovina": "BIH", bosnia: "BIH", ghana: "GHA", tunisia: "TUN",
  "dr congo": "COD", "congo dr": "COD", panama: "PAN", "south africa": "RSA",
  uzbekistan: "UZB", qatar: "QAT", iraq: "IRQ", "saudi arabia": "KSA", jordan: "JOR",
  "cape verde": "CPV", "cabo verde": "CPV", "curacao": "CUR", "curaçao": "CUR",
  haiti: "HAI", "new zealand": "NZL", scotland: "SCO",
};

const ALLOWED_ORIGINS = resolveAllowedOrigins(process.env.ALLOWED_ORIGINS);

function getCorsHeaders(event) {
  return buildCorsHeaders(event, {
    allowedOrigins: ALLOWED_ORIGINS,
    methods: "GET, OPTIONS",
    allowHeaders: "Content-Type",
  });
}

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// Convert decimal odds → implied probabilities, normalised to remove the
// bookmaker overround so they sum to 1 across the matched field.
function oddsToImpliedProbs(outcomes) {
  const raw = {};
  for (const o of outcomes || []) {
    const code = NAME_TO_CODE[String(o.name || "").trim().toLowerCase()];
    const price = Number(o.price);
    if (!code || !Number.isFinite(price) || price <= 1) continue;
    raw[code] = (raw[code] || 0) + 1 / price; // de-vig later
  }
  const total = Object.values(raw).reduce((s, p) => s + p, 0);
  if (total <= 0) return {};
  const probs = {};
  for (const [code, p] of Object.entries(raw)) probs[code] = p / total;
  return probs;
}

async function fetchOdds() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { available: false, source: null, impliedProbs: {} };
  const sport = process.env.ODDS_API_SPORT || "soccer_fifa_world_cup_winner";
  const url = `${ODDS_BASE}/sports/${encodeURIComponent(sport)}/odds?regions=eu&markets=outrights&oddsFormat=decimal&apiKey=${encodeURIComponent(key)}`;

  // Bound the upstream call so a stalled odds API can't hang the function.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`odds API ${res.status}`);
  const data = await res.json();

  // Aggregate outcomes across whatever bookmakers are returned; take the best
  // (highest) price per team, then de-vig.
  const best = {};
  for (const ev of Array.isArray(data) ? data : []) {
    for (const bm of ev.bookmakers || []) {
      for (const mk of bm.markets || []) {
        if (mk.key !== "outrights") continue;
        for (const oc of mk.outcomes || []) {
          const name = String(oc.name || "").trim().toLowerCase();
          const price = Number(oc.price);
          if (!Number.isFinite(price)) continue;
          if (!best[name] || price > best[name]) best[name] = price;
        }
      }
    }
  }
  const outcomes = Object.entries(best).map(([name, price]) => ({ name, price }));
  return {
    available: true,
    source: "the-odds-api",
    fetchedAt: new Date().toISOString(),
    impliedProbs: oddsToImpliedProbs(outcomes),
  };
}

export const handler = async function (event) {
  const headers = getCorsHeaders(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") return json(405, headers, { error: "Method Not Allowed" });
  if (process.env.BETTING_ODDS_DISABLED === "true") {
    return json(200, headers, { available: false, source: null, impliedProbs: {} });
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return json(200, headers, cached.payload);

  if (!inFlight) {
    inFlight = fetchOdds()
      .then((payload) => {
        cached = { at: Date.now(), payload };
        return payload;
      })
      .catch((err) => {
        console.error("betting-odds fetch failed:", err?.message || err);
        // Soft-degrade: empty probs → simulator uses pure Elo.
        return { available: false, source: null, impliedProbs: {} };
      })
      .finally(() => {
        inFlight = null;
      });
  }

  const payload = await inFlight;
  return json(200, headers, payload);
};
