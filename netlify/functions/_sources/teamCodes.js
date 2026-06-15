// FIFA 3-letter code <-> normalized English name aliases for the 48 teams in
// src/data/teams.ts.
//
// Why this exists: api-sports fixtures expose team NAMES (and numeric ids), not
// FIFA codes. On the final group matchday the two matches in a group kick off
// SIMULTANEOUSLY, so a fixture cannot be identified by kickoff time alone — it
// must be identified by its two teams. This table maps an API team name back to
// our code so the client can find the exact fixture regardless of time.
//
// IMPORTANT: the exact strings api-sports uses for a few nations are best-effort
// and should be verified against live data once it exists (hit
// /teams?league=<id>&season=<year> once and log the names, then top up the
// aliases). Unmatched names FAIL SAFE: the fixture simply isn't identified, so
// nothing is written and that score is entered manually — never a wrong score.

const ALIASES = {
  MEX: ["mexico"],
  RSA: ["south africa"],
  KOR: ["south korea", "korea republic", "korea south", "republic of korea"],
  CZE: ["czechia", "czech republic"],
  CAN: ["canada"],
  BIH: ["bosnia and herzegovina", "bosnia herzegovina", "bosnia"],
  QAT: ["qatar"],
  SUI: ["switzerland"],
  BRA: ["brazil"],
  MAR: ["morocco"],
  HAI: ["haiti"],
  SCO: ["scotland"],
  USA: ["usa", "united states", "united states of america"],
  PAR: ["paraguay"],
  AUS: ["australia"],
  TUR: ["turkey", "turkiye"],
  GER: ["germany"],
  CUR: ["curacao"],
  CIV: ["ivory coast", "cote divoire", "cote d ivoire"],
  ECU: ["ecuador"],
  NED: ["netherlands", "holland"],
  JPN: ["japan"],
  SWE: ["sweden"],
  TUN: ["tunisia"],
  BEL: ["belgium"],
  EGY: ["egypt"],
  IRN: ["iran", "ir iran"],
  NZL: ["new zealand"],
  ESP: ["spain"],
  CPV: ["cape verde", "cabo verde"],
  KSA: ["saudi arabia"],
  URU: ["uruguay"],
  FRA: ["france"],
  SEN: ["senegal"],
  IRQ: ["iraq"],
  NOR: ["norway"],
  ARG: ["argentina"],
  ALG: ["algeria"],
  AUT: ["austria"],
  JOR: ["jordan"],
  POR: ["portugal"],
  COD: [
    "dr congo",
    "congo dr",
    "democratic republic of congo",
    "congo democratic republic",
    "dr congo congo",
    "congo",
  ],
  UZB: ["uzbekistan"],
  COL: ["colombia"],
  ENG: ["england"],
  CRO: ["croatia"],
  GHA: ["ghana"],
  PAN: ["panama"],
};

// Lowercase, strip accents + punctuation, collapse whitespace. Makes
// "Türkiye", "Côte d'Ivoire", "Bosnia & Herzegovina" all comparable.
export function normalizeName(s) {
  if (typeof s !== "string") return "";
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // strip combining accents
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const NAME_TO_CODE = {};
for (const [code, names] of Object.entries(ALIASES)) {
  for (const n of names) NAME_TO_CODE[normalizeName(n)] = code;
}

// Resolve an API team name to our FIFA code, or null if unknown.
export function matchTeamName(name) {
  const key = normalizeName(name);
  return key ? NAME_TO_CODE[key] || null : null;
}

// The full set of our 48 FIFA codes — lets other source adapters validate a
// raw abbreviation (e.g. ESPN's "BRA") before trusting it as a code.
export const FIFA_CODES = Object.keys(ALIASES);

export const __test__ = { ALIASES };
