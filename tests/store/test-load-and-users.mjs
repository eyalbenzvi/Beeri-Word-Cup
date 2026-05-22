// Load tests, user management edge cases, DBA issues, data integrity
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
import { groupMatches, ALL_MATCHES } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { calcGroupStandings, calcBracketTeams, deriveAdvancingTeams } from '/home/user/Beeri-World-Cup/src/utils/bracket.js';
import { calculateFullScore, compareTiebreaker } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== LOAD, USER MGMT & DATA INTEGRITY TESTS ===\n");

// ============ LOAD TESTS ============

// ---- 1. 100 simultaneous forms scored ----
console.log("--- 1. Load: 100 forms scored simultaneously ---");
const actualPreds = {};
for (const m of groupMatches) {
  const gt = GROUPS[m.group].map(t => t.code);
  const hi = gt.indexOf(m.homeTeam), ai = gt.indexOf(m.awayTeam);
  actualPreds[m.id] = hi < ai ? { homeScore: 2, awayScore: 0 } : { homeScore: 0, awayScore: 1 };
}
let bracket = calcBracketTeams(actualPreds);
for (const round of ["R32", "R16", "QF", "SF"]) {
  for (const [id, t] of Object.entries(bracket))
    if (id.startsWith(round + "-") && t.home && t.away && !actualPreds[id])
      actualPreds[id] = { homeScore: 1, awayScore: 0 };
  bracket = calcBracketTeams(actualPreds);
}
for (const [id, t] of Object.entries(bracket))
  if ((id === "3RD-1" || id === "F-1") && t.home && t.away && !actualPreds[id])
    actualPreds[id] = { homeScore: 1, awayScore: 0 };
bracket = calcBracketTeams(actualPreds);

const results = {};
for (const [id, p] of Object.entries(actualPreds)) {
  if (id.startsWith("group-")) results[id] = { ...p, stage: "group" };
  else results[id] = { ...p, stage: id.split("-")[0] === "3RD" ? "3RD" : id.split("-")[0] };
}
const actualAdv = deriveAdvancingTeams(bracket);

// Generate 100 random forms
function randomScore() {
  const w = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
  return w[Math.floor(Math.random() * w.length)];
}

const t1 = performance.now();
const scores100 = [];
for (let i = 0; i < 100; i++) {
  const formPreds = {};
  for (const m of ALL_MATCHES) formPreds[m.id] = { homeScore: randomScore(), awayScore: randomScore() };
  const formBracket = calcBracketTeams(formPreds);
  const formAdv = deriveAdvancingTeams(formBracket);
  const score = calculateFullScore(
    { matches: formPreds, advancing: formAdv, champion: null, topScorer: "" },
    results, actualAdv, { champion: null, topScorers: [] }, formBracket, bracket,
  );
  scores100.push(score);
}
const t2 = performance.now();
console.log(`  100 forms scored in ${(t2 - t1).toFixed(0)}ms`);
assert(t2 - t1 < 10000, `100 forms < 10s, took ${(t2 - t1).toFixed(0)}ms`);
assert(scores100.length === 100, "All 100 scored");
assert(scores100.every(s => s.totalPoints >= 0), "All scores non-negative");

// ---- 2. Sort 100 forms by leaderboard ----
console.log("--- 2. Load: sort 100 forms ---");
const t3 = performance.now();
scores100.sort((a, b) => {
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  return compareTiebreaker(a, b);
});
const t4 = performance.now();
console.log(`  Sorted in ${(t4 - t3).toFixed(2)}ms`);
assert(t4 - t3 < 1000, "Sort 100 forms < 1s");
// Verify sorted
for (let i = 0; i < scores100.length - 1; i++) {
  assert(scores100[i].totalPoints >= scores100[i + 1].totalPoints, `Position ${i}: ${scores100[i].totalPoints} >= ${scores100[i + 1].totalPoints}`);
}

// ---- 3. Bracket computation performance ----
console.log("--- 3. Load: 500 bracket computations ---");
const t5 = performance.now();
for (let i = 0; i < 500; i++) {
  const preds = {};
  for (const m of groupMatches) preds[m.id] = { homeScore: randomScore(), awayScore: randomScore() };
  calcBracketTeams(preds);
}
const t6 = performance.now();
console.log(`  500 bracket calcs in ${(t6 - t5).toFixed(0)}ms (${((t6 - t5) / 500).toFixed(1)}ms each)`);
assert(t6 - t5 < 30000, `500 brackets < 30s, took ${(t6 - t5).toFixed(0)}ms`);

// ---- 4. Group standings with extreme scores ----
console.log("--- 4. Extreme scores (100-0) ---");
const extremePreds = {};
for (const m of groupMatches) extremePreds[m.id] = { homeScore: 100, awayScore: 0 };
const extremeStandings = calcGroupStandings(extremePreds);
for (const [group, teams] of Object.entries(extremeStandings)) {
  // Each team plays 3 games (some home, some away). With all home wins 100-0, GF depends on home count.
  assert(teams[0].gf >= 100 && teams[0].gf <= 300, `Group ${group}: extreme GF between 100-300, got ${teams[0].gf}`);
  assert(teams.length === 4, `Group ${group}: still 4 teams`);
  assert(teams.every(t => t.pts >= 0), `Group ${group}: no negative points`);
}
assert(Object.keys(extremeStandings).length === 12, "12 groups with extreme scores");

// ============ USER MANAGEMENT ============

// ---- 5. First user gets admin ----
console.log("--- 5. First user is admin ---");
function ensureUser(users, uid, name) {
  const u = { ...users };
  if (u[uid]) return u;
  u[uid] = { id: uid, displayName: name, isAdmin: Object.keys(u).length === 0 };
  return u;
}
let users = {};
users = ensureUser(users, "first", "Admin");
assert(users["first"].isAdmin === true, "First user is admin");
users = ensureUser(users, "second", "Regular");
assert(users["second"].isAdmin === false, "Second user is NOT admin");
users = ensureUser(users, "third", "Also Regular");
assert(users["third"].isAdmin === false, "Third user is NOT admin");

// ---- 6. Demote admin: can't demote last admin ----
console.log("--- 6. Demote last admin blocked ---");
function demoteAdmin(users, uid) {
  const u = { ...users };
  if (!u[uid]?.isAdmin) return u;
  const adminCount = Object.values(u).filter(x => x.isAdmin).length;
  if (adminCount <= 1) return u; // blocked
  u[uid] = { ...u[uid], isAdmin: false };
  return u;
}
const users6 = { a: { isAdmin: true }, b: { isAdmin: false } };
const after6 = demoteAdmin(users6, "a");
assert(after6.a.isAdmin === true, "Can't demote last admin");

const users6b = { a: { isAdmin: true }, b: { isAdmin: true } };
const after6b = demoteAdmin(users6b, "a");
assert(after6b.a.isAdmin === false, "Can demote when 2 admins");

// ---- 7. Delete user cascades to forms ----
console.log("--- 7. Delete user cascades forms ---");
const mockPreds = {
  "u1__1": { userId: "u1" }, "u1__2": { userId: "u1" },
  "u2__1": { userId: "u2" }, "u3__1": { userId: "u3" },
};
const afterDelete = { ...mockPreds };
for (const fid of Object.keys(afterDelete)) {
  if (afterDelete[fid].userId === "u1") delete afterDelete[fid];
}
assert(Object.keys(afterDelete).length === 2, "2 forms remain after deleting u1");
assert(!afterDelete["u1__1"] && !afterDelete["u1__2"], "u1 forms deleted");
assert(afterDelete["u2__1"] && afterDelete["u3__1"], "Other users' forms intact");

// ---- 8. User display name with special characters ----
console.log("--- 8. Display name edge cases ---");
const specialNames = ["אייל", "O'Brien", 'Name with "quotes"', "名前", "🎉🏆", "", null, undefined];
for (const name of specialNames) {
  const displayName = name || "משתמש";
  assert(typeof displayName === "string" && displayName.length > 0, `Name "${name}" -> "${displayName}"`);
}

// ============ DATA INTEGRITY ============

// ---- 9. Match result with missing fields ----
console.log("--- 9. Partial match results ---");
import { calculateMatchPoints } from '/home/user/Beeri-World-Cup/src/utils/scoring.js';
let r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: null, awayScore: 1 }, "group");
assert(r.points === 0, "Null homeScore in result: 0 pts");
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: 1, awayScore: undefined }, "group");
assert(r.points === 0, "Undefined awayScore in result: 0 pts");

// ---- 10. NaN / Infinity in scores ----
console.log("--- 10. Invalid score values ---");
r = calculateMatchPoints({ homeScore: NaN, awayScore: 0 }, { homeScore: 1, awayScore: 0 }, "group");
assert(r.points === 0 && r.breakdown === "נתון לא תקין", `NaN prediction: ${r.breakdown}`);
r = calculateMatchPoints({ homeScore: 1, awayScore: 0 }, { homeScore: Infinity, awayScore: 0 }, "group");
assert(r.points === 0, "Infinity in result: 0 pts");
r = calculateMatchPoints({ homeScore: "abc", awayScore: 0 }, { homeScore: 1, awayScore: 0 }, "group");
assert(r.points === 0, "String score: 0 pts");

// ---- 11. Negative scores ----
console.log("--- 11. Negative scores ---");
r = calculateMatchPoints({ homeScore: -1, awayScore: 0 }, { homeScore: -1, awayScore: 0 }, "group");
// -1 is a valid number (Number.isFinite), so it would actually be processed
// This tests if the code handles it (it will treat -1 > 0 as false -> away win)
assert(typeof r.points === "number", "Negative scores don't crash");

// ---- 12. String numbers (from form inputs) ----
console.log("--- 12. String number coercion ---");
r = calculateMatchPoints({ homeScore: "2", awayScore: "1" }, { homeScore: 2, awayScore: 1 }, "group");
assert(r.points === 4, `String "2"-"1" matches actual 2-1: exact score = 4pts, got ${r.points}`);

r = calculateMatchPoints({ homeScore: "0", awayScore: "0" }, { homeScore: 0, awayScore: 0 }, "group");
assert(r.points === 4, `String "0"-"0" matches 0-0: exact = 4pts, got ${r.points}`);

// ---- 13. Large prediction object (all 104 matches) ----
console.log("--- 13. Full 104-match prediction object ---");
const fullForm = { matches: {}, advancing: {}, champion: "BRA", topScorer: "Neymar" };
for (const m of ALL_MATCHES) fullForm.matches[m.id] = { homeScore: 1, awayScore: 0 };
assert(Object.keys(fullForm.matches).length === 104, "Form has 104 match predictions");
const fullBracket = calcBracketTeams(fullForm.matches);
assert(Object.keys(fullBracket).length > 0, "Bracket derived from full form");

// ---- 14. Firestore document size check ----
console.log("--- 14. Document size estimation ---");
// Firestore limit: 1MB per document
const formJson = JSON.stringify(fullForm);
const formSize = new TextEncoder().encode(formJson).length;
console.log(`  Full form size: ${(formSize / 1024).toFixed(1)}KB`);
assert(formSize < 1024 * 1024, `Form doc < 1MB: ${(formSize / 1024).toFixed(1)}KB`);

// matchResults document (all 104 results)
const fullResults = {};
for (const m of ALL_MATCHES) fullResults[m.id] = { homeScore: 2, awayScore: 1, stage: "group", updatedAt: new Date().toISOString() };
const resultsJson = JSON.stringify({ data: fullResults });
const resultsSize = new TextEncoder().encode(resultsJson).length;
console.log(`  Results doc size: ${(resultsSize / 1024).toFixed(1)}KB`);
assert(resultsSize < 1024 * 1024, `Results doc < 1MB: ${(resultsSize / 1024).toFixed(1)}KB`);

// Users document with 200 users
const bigUsers = {};
for (let i = 0; i < 200; i++) bigUsers[`uid_${i}`] = { id: `uid_${i}`, displayName: `User ${i}`, isAdmin: i === 0, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };
const usersJson = JSON.stringify({ data: bigUsers });
const usersSize = new TextEncoder().encode(usersJson).length;
console.log(`  Users doc (200 users): ${(usersSize / 1024).toFixed(1)}KB`);
assert(usersSize < 1024 * 1024, `Users doc < 1MB: ${(usersSize / 1024).toFixed(1)}KB`);

// ---- 15. Predictions collection: 200 users × 10 forms = 2000 docs ----
console.log("--- 15. Large predictions collection ---");
// Firestore has no collection size limit, but each doc must be < 1MB
// 2000 forms × ~10KB each = ~20MB total reads on page load
const estimatedReads = 2000;
const estimatedBandwidth = estimatedReads * formSize;
console.log(`  2000 forms: ~${(estimatedBandwidth / 1024 / 1024).toFixed(1)}MB bandwidth`);
// This is a concern! 2000 docs loaded via onSnapshot is expensive
assert(estimatedBandwidth < 100 * 1024 * 1024, "2000 forms < 100MB bandwidth");

// ---- 16. Scoring with 0 actual results (tournament not started) ----
console.log("--- 16. Score with 0 results ---");
const emptyResults = {};
const emptyAdv = {};
const s16 = calculateFullScore(fullForm, emptyResults, emptyAdv, { champion: null, topScorers: [] }, {}, {});
assert(s16.totalPoints === 0, `No results: 0 pts, got ${s16.totalPoints}`);
assert(s16.exactScoreCount === 0, "No results: 0 exact");

// ---- 17. Scoring with partial results (only some groups played) ----
console.log("--- 17. Score with partial results ---");
const partialResults = {};
// Only group A fully played
for (const m of groupMatches.filter(m => m.group === "A")) {
  partialResults[m.id] = { homeScore: 1, awayScore: 0, stage: "group" };
}
const s17 = calculateFullScore(fullForm, partialResults, {}, { champion: null, topScorers: [] }, {}, {});
assert(s17.totalPoints > 0, `Partial results: some points (${s17.totalPoints})`);
assert(s17.exactScoreCount <= 6, `At most 6 exact (group A only), got ${s17.exactScoreCount}`);

// ---- 18. Empty predictions collection (no forms submitted) ----
console.log("--- 18. Empty leaderboard ---");
const emptyPreds = {};
const leaderboard = Object.entries(emptyPreds)
  .filter(([, d]) => d.status === "submitted")
  .map(([fid, d]) => ({ formId: fid, totalPoints: 0 }));
assert(leaderboard.length === 0, "Empty predictions: empty leaderboard");

// ---- 19. Form with extra/unknown fields (backwards compat) ----
console.log("--- 19. Form with extra fields ---");
const formWithExtra = {
  matches: { "group-A-1": { homeScore: 1, awayScore: 0 } },
  advancing: {},
  champion: null,
  topScorer: "",
  status: "submitted",
  unknownField: "should not break anything",
  anotherField: 42,
};
const bracket19 = calcBracketTeams(formWithExtra.matches);
// Should not crash
assert(bracket19 !== null, "Extra fields don't break bracket calc");

// ---- 20. Unicode in top scorer name ----
console.log("--- 20. Unicode top scorer ---");
const s20 = calculateFullScore(
  { matches: {}, champion: null, topScorer: "ネイマール", advancing: {} },
  {}, {}, { champion: null, topScorers: ["ネイマール"] }, {}, {},
);
assert(s20.correctTopScorer === true, "Unicode top scorer matches");

const s20b = calculateFullScore(
  { matches: {}, champion: null, topScorer: "ליאו מסי", advancing: {} },
  {}, {}, { champion: null, topScorers: ["ליאו מסי"] }, {}, {},
);
assert(s20b.correctTopScorer === true, "Hebrew top scorer matches");

// ---- 21. Admin users tab: identifier extraction logic ----
console.log("--- 21. Admin users tab identifier logic ---");
function getAdminUserIdentifier(uid, email) {
  if (email) return email;
  if (uid.startsWith("phone_")) {
    const phone = uid.replace("phone_", "");
    if (/^\d+$/.test(phone)) return phone;
  }
  return null;
}
assert(getAdminUserIdentifier("google-uid-abc", "user@gmail.com") === "user@gmail.com", "Google user: shows email");
assert(getAdminUserIdentifier("phone_0521234567", null) === "0521234567", "Legacy phone UID: shows digits");
assert(getAdminUserIdentifier("phone_3a4b5c6d7e8f9a0b", null) === null, "Hashed phone UID: shows nothing");
assert(getAdminUserIdentifier("phone_0521234567", "also@gmail.com") === "also@gmail.com", "Email takes priority over phone UID");
assert(getAdminUserIdentifier("google-uid-xyz", null) === null, "Google user without email: shows nothing");

console.log(`\n=== LOAD & USER TESTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
