// Tests for Profile, ProfileSetup, FormIconPicker features
import { readFileSync, existsSync } from 'fs';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = '/home/user/Beeri-World-Cup/src';
const read = (f) => readFileSync(f, 'utf8');
// Tolerate optional files (component may have been removed); test blocks
// guarded by `tryRead` skip cleanly instead of crashing the whole suite.
const tryRead = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

console.log("=== PROFILE FEATURES TESTS ===\n");

// ---- 1. Profile.jsx exists and has required elements ----
console.log("--- 1. Profile page structure ---");
const profileFile = read(`${SRC}/pages/Profile.jsx`);
assert(profileFile.includes('export default'), "Profile.jsx: has default export");
assert(profileFile.includes('useCurrentUser'), "Profile: uses useCurrentUser hook");
assert(profileFile.includes('navigate'), "Profile: has navigation");
// photo/avatar UI was intentionally removed — Profile renders an
// initials-based FormAvatar instead. Test now codifies the absence so a
// future re-introduction is a deliberate choice.
assert(!profileFile.includes('photoURL') && !profileFile.includes('user.photo'), "Profile: photoURL UI is intentionally absent");
assert(profileFile.includes('displayName'), "Profile: shows display name");
assert(profileFile.includes('firstName') || profileFile.includes('שם פרטי'), "Profile: shows first name");
assert(profileFile.includes('logout') || profileFile.includes('התנתק') || profileFile.includes('יציאה'), "Profile: has logout");
assert(profileFile.includes('formIcon') || profileFile.includes('📋'), "Profile: shows form icons");
assert(profileFile.includes('createdAt') || profileFile.includes('הצטרף'), "Profile: shows join date");
assert(!profileFile.includes('isAdmin') || profileFile.includes('isAdmin') && !profileFile.includes('isAdmin: true'), "Profile: doesn't allow setting isAdmin");

// ---- 2. ProfileSetup.jsx exists and works ----
console.log("--- 2. ProfileSetup component ---");
const setupFile = read(`${SRC}/components/ProfileSetup.jsx`);
assert(setupFile.includes('export default'), "ProfileSetup: has default export");
assert(setupFile.includes('profileCompleted'), "ProfileSetup: sets profileCompleted");
assert(setupFile.includes('firstName') || setupFile.includes('שם פרטי'), "ProfileSetup: has first name input");
assert(setupFile.includes('lastName') || setupFile.includes('שם משפחה'), "ProfileSetup: has last name input");
assert(setupFile.includes('דלג') || setupFile.includes('skip'), "ProfileSetup: has skip option");
assert(setupFile.includes('updateUserProfile'), "ProfileSetup: calls updateUserProfile");
assert(setupFile.includes('displayName'), "ProfileSetup: handles displayName");
assert(!setupFile.includes('photoURL') && !setupFile.includes('user.photo'), "ProfileSetup: photoURL UI is intentionally absent");
assert(!setupFile.includes('dangerouslySetInnerHTML'), "ProfileSetup: no XSS vectors");
assert(!setupFile.includes('eval('), "ProfileSetup: no eval");

// ---- 3. FormIconPicker.jsx (optional — component was removed at some
//        point but the test stays in case it's reintroduced) ----
console.log("--- 3. FormIconPicker component ---");
const iconPickerFile = tryRead(`${SRC}/components/FormIconPicker.jsx`);
if (iconPickerFile) {
  assert(iconPickerFile.includes('export default'), "FormIconPicker: has default export");
  assert(iconPickerFile.includes('onChange') || iconPickerFile.includes('onSelect'), "FormIconPicker: has change callback");
  assert(iconPickerFile.includes('⚽') || iconPickerFile.includes('🏆'), "FormIconPicker: has emoji options");
  assert(iconPickerFile.includes('📋'), "FormIconPicker: has default 📋 option");
} else {
  console.log("  (skipped — FormIconPicker.jsx not present)");
}

// ---- 4. Store: updateUserProfile function ----
console.log("--- 4. Store profile functions ---");
const storeFile = read(`${SRC}/store.js`);
assert(/export async function updateUserProfile/.test(storeFile), "Store: updateUserProfile exported as async");
assert(storeFile.includes('firstName') && storeFile.includes('lastName'), "Store: handles firstName/lastName");
assert(storeFile.includes('profileCompleted'), "Store: handles profileCompleted");
// Verify updateUserProfile only destructures safe fields (not isAdmin)
const updateProfileFn = storeFile.match(/export async function updateUserProfile[\s\S]*?\n\}/)?.[0] || '';
assert(!updateProfileFn.includes('isAdmin'), "Store: updateUserProfile doesn't touch isAdmin");

// ---- 5. Backward compatibility — fallbacks ----
console.log("--- 5. Backward compatibility ---");

// App.jsx: profileCompleted check is === false, not !profileCompleted
const appFile = read(`${SRC}/App.jsx`);
assert(appFile.includes('profileCompleted === false'), "App: checks profileCompleted === false (not truthy check)");
assert(appFile.includes('ProfileSetup'), "App: imports ProfileSetup");
assert(appFile.includes('profile: Profile') || appFile.includes("profile"), "App: Profile in PAGES");

// Layout: avatar fallback to initials
const layoutFile = read(`${SRC}/components/Layout.jsx`);
assert(!layoutFile.includes('photoURL'), "Layout: photoURL UI is intentionally absent");
assert(layoutFile.includes('charAt(0)') || layoutFile.includes('charAt'), "Layout: initials fallback");
assert(layoutFile.includes('navigate("profile")') || layoutFile.includes("navigate('profile')"), "Layout: avatar links to profile");

// FormList: formIcon fallback
const formListFile = read(`${SRC}/components/FormList.jsx`);
assert(formListFile.includes('formIcon') || formListFile.includes('📋'), "FormList: shows formIcon with fallback");

// Leaderboard: avatar + formIcon
const leaderboardFile = read(`${SRC}/pages/Leaderboard.jsx`);
// formIcon was deprecated when FormIconPicker was removed; Leaderboard
// now renders FormAvatar (initials) — the existence check moved there.
assert(leaderboardFile.includes('FormAvatar'), "Leaderboard: renders FormAvatar (initials, formIcon deprecated)");
assert(!leaderboardFile.includes('photoURL'), "Leaderboard: photoURL UI is intentionally absent");

// ---- 6. FormDetailsTab ----
console.log("--- 6. FormDetailsTab ---");
const fdtFile = read(`${SRC}/components/FormDetailsTab.jsx`);
assert(fdtFile.includes('formName') || fdtFile.includes('שם הטופס'), "FormDetailsTab: has form name field");

// ---- 7. New user flow ----
console.log("--- 7. New user creation ---");
// ensureUserInStore should set profileCompleted: false for new users
assert(storeFile.includes('profileCompleted: false'), "Store: new users get profileCompleted: false");
assert(!storeFile.includes('photoURL: null'), "Store: photoURL is no longer stored on new users");

// ---- 8. Security checks ----
console.log("--- 8. Security ---");
assert(!profileFile.includes('isAdmin'), "Profile: doesn't expose admin controls");
assert(!setupFile.includes('isAdmin'), "ProfileSetup: doesn't set isAdmin");
// Profile page should not allow editing other users
assert(profileFile.includes('user?.id') || profileFile.includes('user.id'), "Profile: scoped to current user");

// ---- 9. No setState during render in new components ----
console.log("--- 9. React patterns ---");
const reactCheckTargets = [['Profile', profileFile], ['ProfileSetup', setupFile]];
if (iconPickerFile) reactCheckTargets.push(['FormIconPicker', iconPickerFile]);
for (const [name, content] of reactCheckTargets) {
  const renderFns = content.match(/const render\w+\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{2}\};/g) || [];
  for (const fn of renderFns) {
    const fnName = fn.match(/const (render\w+)/)?.[1] || 'unknown';
    const hasSetState = fn.split('\n').some(line =>
      line.match(/^\s+set[A-Z]\w+\(/) && !line.includes('=>') && !line.includes('onClick')
    );
    assert(!hasSetState, `${name}: ${fnName} no setState during render`);
  }
  assert(!content.includes('dangerouslySetInnerHTML'), `${name}: no XSS`);
  assert(!content.includes('eval('), `${name}: no eval`);
}

// ---- 10. CSP allows Google profile photos ----
console.log("--- 10. CSP headers ---");
const headers = read('/home/user/Beeri-World-Cup/public/_headers');
assert(headers.includes('img-src') && headers.includes('https:'), "CSP: img-src allows HTTPS (covers Google photos)");

console.log(`\n=== PROFILE FEATURES RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
