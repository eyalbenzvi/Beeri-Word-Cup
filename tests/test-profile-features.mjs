// Tests for Profile, ProfileSetup, FormIconPicker features
import { readFileSync } from 'fs';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

const SRC = '/home/user/Beeri-World-Cup/src';
const read = (f) => readFileSync(f, 'utf8');

console.log("=== PROFILE FEATURES TESTS ===\n");

// ---- 1. Profile.jsx exists and has required elements ----
console.log("--- 1. Profile page structure ---");
const profileFile = read(`${SRC}/pages/Profile.jsx`);
assert(profileFile.includes('export default'), "Profile.jsx: has default export");
assert(profileFile.includes('useCurrentUser'), "Profile: uses useCurrentUser hook");
assert(profileFile.includes('navigate'), "Profile: has navigation");
assert(profileFile.includes('photoURL') || profileFile.includes('photo'), "Profile: shows photo/avatar");
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
assert(setupFile.includes('photoURL') || setupFile.includes('photo'), "ProfileSetup: shows photo");
assert(!setupFile.includes('dangerouslySetInnerHTML'), "ProfileSetup: no XSS vectors");
assert(!setupFile.includes('eval('), "ProfileSetup: no eval");

// ---- 3. FormIconPicker.jsx ----
console.log("--- 3. FormIconPicker component ---");
const iconPickerFile = read(`${SRC}/components/FormIconPicker.jsx`);
assert(iconPickerFile.includes('export default'), "FormIconPicker: has default export");
assert(iconPickerFile.includes('onChange') || iconPickerFile.includes('onSelect'), "FormIconPicker: has change callback");
assert(iconPickerFile.includes('⚽') || iconPickerFile.includes('🏆'), "FormIconPicker: has emoji options");
assert(iconPickerFile.includes('📋'), "FormIconPicker: has default 📋 option");

// ---- 4. Store: updateUserProfile function ----
console.log("--- 4. Store profile functions ---");
const storeFile = read(`${SRC}/store.js`);
assert(storeFile.includes('export function updateUserProfile'), "Store: updateUserProfile exported");
assert(storeFile.includes('firstName') && storeFile.includes('lastName'), "Store: handles firstName/lastName");
assert(storeFile.includes('profileCompleted'), "Store: handles profileCompleted");
// Verify updateUserProfile only destructures safe fields (not isAdmin)
const updateProfileFn = storeFile.match(/export function updateUserProfile[\s\S]*?\n\}/)?.[0] || '';
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
assert(layoutFile.includes('photoURL'), "Layout: checks photoURL");
assert(layoutFile.includes('charAt(0)') || layoutFile.includes('charAt'), "Layout: initials fallback");
assert(layoutFile.includes('navigate("profile")') || layoutFile.includes("navigate('profile')"), "Layout: avatar links to profile");

// FormList: formIcon fallback
const formListFile = read(`${SRC}/components/FormList.jsx`);
assert(formListFile.includes('formIcon') || formListFile.includes('📋'), "FormList: shows formIcon with fallback");

// Leaderboard: avatar + formIcon
const leaderboardFile = read(`${SRC}/pages/Leaderboard.jsx`);
assert(leaderboardFile.includes('formIcon') || leaderboardFile.includes('📋'), "Leaderboard: shows formIcon");
assert(leaderboardFile.includes('photoURL'), "Leaderboard: shows avatar");

// ---- 6. FormDetailsTab: icon picker ----
console.log("--- 6. FormDetailsTab icon picker ---");
const fdtFile = read(`${SRC}/components/FormDetailsTab.jsx`);
assert(fdtFile.includes('FormIconPicker') || fdtFile.includes('formIcon'), "FormDetailsTab: has icon picker/display");

// ---- 7. New user flow ----
console.log("--- 7. New user creation ---");
// ensureUserInStore should set profileCompleted: false for new users
assert(storeFile.includes('profileCompleted: false'), "Store: new users get profileCompleted: false");
assert(storeFile.includes('photoURL: null'), "Store: new users get photoURL: null");

// ---- 8. Security checks ----
console.log("--- 8. Security ---");
assert(!profileFile.includes('isAdmin'), "Profile: doesn't expose admin controls");
assert(!setupFile.includes('isAdmin'), "ProfileSetup: doesn't set isAdmin");
// Profile page should not allow editing other users
assert(profileFile.includes('user?.id') || profileFile.includes('user.id'), "Profile: scoped to current user");

// ---- 9. No setState during render in new components ----
console.log("--- 9. React patterns ---");
for (const [name, content] of [['Profile', profileFile], ['ProfileSetup', setupFile], ['FormIconPicker', iconPickerFile]]) {
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
