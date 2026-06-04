// Regression: Admin > Users tab — display + edit of user identity fields.
//
// Feature contract (deliberately tight, per the product request + CLAUDE.md
// side-effect discipline):
//   - The admin can SEE each user's nickname (displayName), firstName,
//     lastName.
//   - The admin can EDIT exactly those three fields, reusing the SAME
//     updateUserProfile() the user calls on themselves.
//   - The edit path must NOT touch isAdmin / email / status / profileCompleted
//     / forms or any other field. This is the hard "very limited" constraint.
//   - Input caps must stay <= firestore.rules bounds (displayName<=100,
//     firstName<=50, lastName<=50) so a rule rejection on length is impossible.
import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== ADMIN USERS EDIT TESTS ===\n");

const src = readMigratedSrc("src/components/AdminUsersTab.jsx");

// ---- 1. Reuses the existing self-edit mutation ----
console.log("--- 1. Mutation wiring ---");
assert(/import\s*\{[^}]*\bupdateUserProfile\b[^}]*\}\s*from\s*["']\.\.\/store["']/.test(src),
  "imports updateUserProfile from the store barrel");
assert(src.includes("updateUserProfile("), "calls updateUserProfile()");

// ---- 2. Displays nickname + first + last ----
console.log("--- 2. Identity display ---");
assert(src.includes("כינוי"), "renders a 'כינוי' (nickname) label");
assert(src.includes("u.firstName") && src.includes("u.lastName"),
  "reads firstName + lastName for display");
assert(src.includes("u.displayName"), "reads displayName (nickname) for display");

// ---- 3. Edit inputs exist with the correct (stricter-than-rules) caps ----
console.log("--- 3. Edit inputs + length caps ---");
assert(src.includes("שם פרטי") && src.includes("שם משפחה"),
  "edit panel has first/last name inputs");
// Caps used in the edit inputs.
const caps = [...src.matchAll(/maxLength=\{(\d+)\}/g)].map((m) => Number(m[1]));
assert(caps.includes(30), "uses maxLength 30 (first/last name)");
assert(caps.includes(20), "uses maxLength 20 (nickname)");
// firestore.rules bounds: displayName<=100, firstName<=50, lastName<=50.
// Every cap in this component must be <= the most permissive rule bound (100)
// AND the name caps (30) must be <= 50, nickname (20) <= 100. A simple, robust
// invariant: no cap may exceed 50, which is <= all three rule bounds.
assert(caps.every((c) => c <= 50),
  `all input caps <= 50 (<= firestore.rules bounds); got [${caps.join(", ")}]`);

// ---- 4. NEGATIVE constraints — the edit call must be VERY limited ----
console.log("--- 4. Scope lockdown (negative assertions) ---");
// Isolate the saveEdit function body and assert it only passes the 3 fields.
const saveFn = src.match(/async function saveEdit[\s\S]*?\n  \}/)?.[0] || "";
assert(saveFn.length > 0, "saveEdit function is present");
// Isolate the EXACT object literal handed to updateUserProfile — the only
// thing that gets persisted. Reading currentUser.isAdmin in the guard must
// NOT count as "writing isAdmin", so we assert against the payload, not the
// whole function body.
const payload = saveFn.match(/updateUserProfile\(uid,\s*\{([\s\S]*?)\}\)/)?.[1] || "";
assert(payload.length > 0, "updateUserProfile is called with an object payload");
assert(payload.includes("firstName") && payload.includes("lastName") && payload.includes("displayName"),
  "payload passes firstName + lastName + displayName");
for (const forbidden of ["isAdmin", "profileCompleted", "email", "status", "budgetNumber", "matches", "userId"]) {
  assert(!payload.includes(forbidden),
    `payload does NOT touch '${forbidden}'`);
}
// The edit path must NOT reach for lower-level / cross-domain writers.
for (const forbidden of ["updateUserField(", "createUserField(", "writeGameDoc(", "deleteForm(", "setAdminClaim(", "deleteUser("]) {
  assert(!saveFn.includes(forbidden),
    `saveEdit does NOT call '${forbidden}'`);
}
// Never persist an empty nickname (fallback chain on the trimmed value).
assert(/displayName:\s*nick\s*\|\|/.test(saveFn),
  "saveEdit guards against an empty nickname (fallback chain)");
// Hardening: trim so an admin can't push whitespace into a PUBLIC name.
assert(saveFn.includes("editNick.trim()")
  && saveFn.includes("editFirst.trim()")
  && saveFn.includes("editLast.trim()"),
  "saveEdit trims all three fields before persisting");
// Defense-in-depth: client admin guard, consistent with other admin mutations.
assert(/if\s*\(!currentUser\?\.isAdmin\)\s*return/.test(saveFn),
  "saveEdit has a client-side admin guard (defense-in-depth)");

// ---- 5. One-row-at-a-time editing (no 150 inline forms) ----
console.log("--- 5. Single-row edit state ---");
assert(src.includes("editingUid"), "uses a single editingUid state");

// ---- 6. Bug-hardening: per-row scoping + state hygiene + races ----
console.log("--- 6. Bug-hardening ---");
// BUG: editing the wrong user. The panel and the save action must be scoped
// to the row's own uid, not a shared/last-clicked one.
assert(src.includes("editingUid === uid"),
  "edit panel is gated by `editingUid === uid` (correct row only)");
assert(/saveEdit\(uid,\s*u\)/.test(src),
  "saveEdit is invoked with the row's own (uid, u)");

// BUG: switching from editing user A straight to user B leaves A's values in
// the inputs. startEdit must re-prefill ALL three fields from the target user.
const startFn = src.match(/function startEdit[\s\S]*?\n  \}/)?.[0] || "";
assert(startFn.includes("setEditFirst(u.firstName")
  && startFn.includes("setEditLast(u.lastName")
  && startFn.includes("setEditNick(u.displayName"),
  "startEdit re-prefills first/last/nick from the target user (no stale carry-over)");

// BUG: cancel/close must fully reset so a re-open never shows a previous edit.
const cancelFn = src.match(/function cancelEdit[\s\S]*?\n  \}/)?.[0] || "";
assert(cancelFn.includes("setEditingUid(null)"), "cancelEdit closes the panel");
assert(cancelFn.includes("setEditFirst(\"\")")
  && cancelFn.includes("setEditLast(\"\")")
  && cancelFn.includes("setEditNick(\"\")"),
  "cancelEdit clears all three input states");

// BUG: double-submit (admin double-taps שמור) firing two writes / racing.
assert(/if\s*\(savingEdit\)\s*return/.test(saveFn),
  "saveEdit is re-entrancy guarded (no double-submit)");
assert(src.includes("disabled={savingEdit}"),
  "save/cancel buttons disabled while a write is in flight");

// BUG: a failed write silently looks like success. The failure path must toast.
assert(/showToast\([^)]*,\s*["']error["']\)/.test(saveFn),
  "saveEdit surfaces an error toast on failure");
assert(saveFn.includes("cancelEdit()"),
  "saveEdit only closes the panel after a successful write");

// BUG: missing displayName renders a blank gap in the list. Show a placeholder.
assert(/u\.displayName\s*\|\|\s*"—"/.test(src),
  "display line falls back to a placeholder when nickname is missing");

// A11y: each edit input is associated with its label via a uid-scoped id, so
// the per-row panels don't collide and screen readers announce the field.
assert(src.includes("htmlFor={`edit-first-${uid}`}")
  && src.includes("id={`edit-first-${uid}`}"),
  "first-name input is label-associated with a uid-scoped id");
assert(src.includes("htmlFor={`edit-nick-${uid}`}")
  && src.includes("id={`edit-nick-${uid}`}"),
  "nickname input is label-associated with a uid-scoped id");

// Listener-clobber: edit inputs are independent local state (NOT synced from
// props via useEffect), so an incoming users-listener update can't overwrite
// an in-progress edit. Assert no effect re-derives the edit inputs from props.
assert(!/useEffect\([^)]*setEditFirst/.test(src),
  "no useEffect clobbers the in-progress edit inputs from props");

console.log(`\n=== ADMIN USERS EDIT RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
