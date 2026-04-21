// Tests for player display/lookup/isSamePlayer helpers
import { TOP_SCORER_PLAYERS } from '/home/user/Beeri-World-Cup/src/data/players.js';
import {
  getPlayerDisplayName,
  getPlayerByEitherName,
  isSamePlayer,
  canonicalPlayerValue,
  resolvePlayerList,
} from '/home/user/Beeri-World-Cup/src/utils/playerSearch.js';

let passed = 0, failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== PLAYER DISPLAY / LOOKUP TESTS ===\n");

// ---- getPlayerDisplayName ----
console.log("--- getPlayerDisplayName ---");
assert(getPlayerDisplayName("Lionel Messi") === "ליאונל מסי", `English → Hebrew: got "${getPlayerDisplayName("Lionel Messi")}"`);
assert(getPlayerDisplayName("ליאונל מסי") === "ליאונל מסי", `Hebrew → Hebrew passthrough`);
assert(getPlayerDisplayName("") === "", `Empty → empty`);
assert(getPlayerDisplayName(null) === "", `null → empty`);
assert(getPlayerDisplayName(undefined) === "", `undefined → empty`);
assert(getPlayerDisplayName("Unknown Player") === "Unknown Player", `Unknown → fallback`);
assert(getPlayerDisplayName("Harry Kane") === "הארי קיין", `Kane → Hebrew`);
assert(getPlayerDisplayName("Erling Haaland") === "ארלינג הולאנד", `Haaland → Hebrew`);
assert(getPlayerDisplayName("Cristiano Ronaldo") === "כריסטיאנו רונאלדו", `Ronaldo → Hebrew`);

// ---- getPlayerByEitherName ----
console.log("--- getPlayerByEitherName ---");
const p1 = getPlayerByEitherName("Lionel Messi");
assert(p1?.nameHe === "ליאונל מסי" && p1?.team === "ARG", `By English name`);
const p2 = getPlayerByEitherName("ליאונל מסי");
assert(p2?.name === "Lionel Messi" && p2?.team === "ARG", `By Hebrew name`);
assert(getPlayerByEitherName("Unknown") === null, `Unknown returns null`);
assert(getPlayerByEitherName("") === null, `Empty returns null`);
assert(getPlayerByEitherName(null) === null, `null returns null`);

// ---- isSamePlayer ----
console.log("--- isSamePlayer ---");
assert(isSamePlayer("Lionel Messi", "ליאונל מסי") === true, `En == He same player`);
assert(isSamePlayer("ליאונל מסי", "Lionel Messi") === true, `He == En same player (reverse)`);
assert(isSamePlayer("Lionel Messi", "Lionel Messi") === true, `En == En same`);
assert(isSamePlayer("ליאונל מסי", "ליאונל מסי") === true, `He == He same`);
assert(isSamePlayer("Lionel Messi", "Cristiano Ronaldo") === false, `Different players`);
assert(isSamePlayer("Lionel Messi", "ארלינג הולאנד") === false, `Different players cross-lang`);
assert(isSamePlayer("Lionel Messi", "") === false, `Empty not same`);
assert(isSamePlayer("", "Lionel Messi") === false, `Empty not same (reverse)`);
assert(isSamePlayer(null, null) === false, `null null not same`);
// Unknown players fall back to string comparison
assert(isSamePlayer("Pelé", "Pelé") === true, `Unknown but equal strings → true`);
assert(isSamePlayer("Pelé", "Maradona") === false, `Unknown diff strings → false`);

// ---- canonicalPlayerValue ----
console.log("--- canonicalPlayerValue ---");
assert(canonicalPlayerValue("Lionel Messi") === "ליאונל מסי", `En → Hebrew canonical`);
assert(canonicalPlayerValue("ליאונל מסי") === "ליאונל מסי", `He stays`);
assert(canonicalPlayerValue("Unknown X") === "Unknown X", `Unknown passthrough`);
assert(canonicalPlayerValue("") === "", `Empty`);
assert(canonicalPlayerValue("  Harry Kane  ") === "הארי קיין", `Trimmed input resolves`);

// ---- resolvePlayerList ----
console.log("--- resolvePlayerList ---");
assert(resolvePlayerList(null) === TOP_SCORER_PLAYERS, `null → default list`);
assert(resolvePlayerList(undefined) === TOP_SCORER_PLAYERS, `undefined → default list`);
assert(resolvePlayerList([]) === TOP_SCORER_PLAYERS, `empty → default list`);
const custom = [{ team: "X", name: "Test", nameHe: "טסט" }];
assert(resolvePlayerList(custom) === custom, `non-empty → custom`);

// ---- Custom list lookups ----
console.log("--- Custom list lookups ---");
const customList = [
  { team: "ARG", name: "Lionel Messi", nameHe: "מסי שלי" },
];
assert(getPlayerDisplayName("Lionel Messi", customList) === "מסי שלי", `Custom list override`);
assert(getPlayerDisplayName("מסי שלי", customList) === "מסי שלי", `Custom He match`);

// ---- Legacy list (no nameHe) ----
console.log("--- Legacy list ---");
const legacyList = [{ team: "ARG", name: "Lionel Messi" }];
assert(getPlayerDisplayName("Lionel Messi", legacyList) === "Lionel Messi", `Legacy en w/o He → en fallback`);
const p3 = getPlayerByEitherName("Lionel Messi", legacyList);
assert(p3?.name === "Lionel Messi", `Legacy lookup by en`);
assert(isSamePlayer("Lionel Messi", "Lionel Messi", legacyList) === true, `Legacy en match`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
