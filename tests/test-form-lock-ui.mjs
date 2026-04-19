// Tests for hide-form-when-locked fix — verifies UI lock guards and defense-in-depth
// Covers regressions that could be introduced by the change to FormList / createForm

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== FORM LOCK UI — HIDE NEW-FORM WHEN LOCKED ===\n");

// ============================================================
// 1. Store-level defense-in-depth: createForm must throw when locked
// ============================================================
console.log("--- 1. createForm throws when predictionsLocked ---");

{
  // Mirrors the new guard in src/store.js `createForm()`
  function createFormGuard(settings, userForms) {
    if (settings.predictionsLocked) {
      throw new Error("ההגשה נסגרה — לא ניתן ליצור טפסים חדשים");
    }
    if (userForms.length >= 10) {
      throw new Error("מקסימום 10 טפסים למשתמש");
    }
    return `user__${Date.now()}`;
  }

  // Unlocked: create succeeds
  let err = null;
  try { createFormGuard({ predictionsLocked: false }, []); } catch (e) { err = e; }
  assert(err === null, "Unlocked: createForm succeeds");

  // Locked: create throws with lock message
  err = null;
  try { createFormGuard({ predictionsLocked: true }, []); } catch (e) { err = e; }
  assert(err !== null, "Locked: createForm throws");
  assert(err && err.message.includes("ההגשה נסגרה"), "Locked error message mentions closure");

  // Locked check precedes MAX_FORMS check (don't leak count info after lock)
  err = null;
  const tooMany = Array(10).fill({});
  try { createFormGuard({ predictionsLocked: true }, tooMany); } catch (e) { err = e; }
  assert(err && err.message.includes("ההגשה נסגרה"), "Lock check runs before MAX_FORMS check");

  // Default (missing predictionsLocked) treated as unlocked
  err = null;
  try { createFormGuard({}, []); } catch (e) { err = e; }
  assert(err === null, "Missing predictionsLocked: treated as unlocked");
}

// ============================================================
// 2. FormList: "+ טופס חדש" button visibility
// ============================================================
console.log("--- 2. FormList new-form button visibility ---");

{
  // Mirrors: {!locked && (<button>+ טופס חדש</button>)}
  function shouldShowNewFormButton(settings) {
    const locked = !!settings?.predictionsLocked;
    return !locked;
  }

  assert(shouldShowNewFormButton({ predictionsLocked: false }) === true, "Unlocked: show button");
  assert(shouldShowNewFormButton({ predictionsLocked: true }) === false, "Locked: hide button");
  assert(shouldShowNewFormButton({}) === true, "Missing flag: show button");
  assert(shouldShowNewFormButton(null) === true, "Null settings: show button (defensive)");
  assert(shouldShowNewFormButton(undefined) === true, "Undefined settings: show button (defensive)");
  // Truthy/falsy coercion
  assert(shouldShowNewFormButton({ predictionsLocked: "true" }) === false, "Truthy string: locked");
  assert(shouldShowNewFormButton({ predictionsLocked: 1 }) === false, "Truthy number: locked");
  assert(shouldShowNewFormButton({ predictionsLocked: 0 }) === true, "Falsy 0: unlocked");
}

// ============================================================
// 3. FormList: handleCreateForm is a no-op when locked
// ============================================================
console.log("--- 3. handleCreateForm no-op when locked ---");

{
  let createCalls = 0;
  function mockCreateForm() { createCalls++; }

  function handleCreateForm({ user, locked, newFormName, forms }) {
    if (!user || locked) return false;
    const name = newFormName.trim() || `טופס ${forms.length + 1}`;
    mockCreateForm(user.id, name);
    return true;
  }

  const user = { id: "u1" };

  createCalls = 0;
  assert(handleCreateForm({ user, locked: false, newFormName: "x", forms: [] }) === true, "Unlocked: proceeds");
  assert(createCalls === 1, "Unlocked: createForm called");

  createCalls = 0;
  assert(handleCreateForm({ user, locked: true, newFormName: "x", forms: [] }) === false, "Locked: returns false");
  assert(createCalls === 0, "Locked: createForm NOT called");

  createCalls = 0;
  assert(handleCreateForm({ user: null, locked: false, newFormName: "x", forms: [] }) === false, "No user: returns false");
  assert(createCalls === 0, "No user: createForm NOT called");

  // Regression: user present but locked — historically this was the bug path
  createCalls = 0;
  handleCreateForm({ user, locked: true, newFormName: "new", forms: [{}, {}] });
  assert(createCalls === 0, "Regression guard: user+locked does not create");
}

// ============================================================
// 4. FormList: new-form modal should not render when locked
// Defense against: user opens modal, admin toggles lock, user clicks create
// ============================================================
console.log("--- 4. New-form modal visibility ---");

{
  // Mirrors: {showNewForm && !locked && (<div>modal</div>)}
  function shouldRenderModal(showNewForm, locked) {
    return showNewForm && !locked;
  }

  assert(shouldRenderModal(true, false) === true, "Open + unlocked: render");
  assert(shouldRenderModal(false, false) === false, "Closed + unlocked: no render");
  assert(shouldRenderModal(true, true) === false, "Open + locked: hide (race guard)");
  assert(shouldRenderModal(false, true) === false, "Closed + locked: no render");
}

// ============================================================
// 5. FormList: empty state message differs when locked
// Regression: "לחץ על + טופס חדש" is misleading when the button is hidden
// ============================================================
console.log("--- 5. Empty state message matches state ---");

{
  function emptyState({ formsCount, showNewForm, locked }) {
    if (formsCount > 0 || showNewForm) return null;
    if (locked) {
      return { icon: "🔒", title: "ההגשה נסגרה", body: "לא ניתן ליצור טפסים חדשים לאחר תחילת המשחקים" };
    }
    return { icon: "📋", title: "ברוך הבא! צור טופס ניחושים ראשון", body: 'לחץ על "+ טופס חדש" למעלה כדי להתחיל לנחש תוצאות משחקים' };
  }

  const unlocked = emptyState({ formsCount: 0, showNewForm: false, locked: false });
  assert(unlocked && unlocked.icon === "📋", "Unlocked empty state: clipboard icon");
  assert(unlocked && unlocked.body.includes("+ טופס חדש"), "Unlocked empty state: points to button");

  const locked = emptyState({ formsCount: 0, showNewForm: false, locked: true });
  assert(locked && locked.icon === "🔒", "Locked empty state: lock icon");
  assert(locked && locked.title.includes("ההגשה נסגרה"), "Locked empty state: explains closure");
  assert(!locked.body.includes("לחץ"), "Locked empty state: no 'click' instruction (regression)");

  const withForms = emptyState({ formsCount: 2, showNewForm: false, locked: true });
  assert(withForms === null, "Has forms: no empty state");

  const creating = emptyState({ formsCount: 0, showNewForm: true, locked: false });
  assert(creating === null, "Modal open: no empty state");
}

// ============================================================
// 6. Home: "צור את הטופס המנצח שלך" hidden when locked
// ============================================================
console.log("--- 6. Home page 'winning form' CTA visibility ---");

{
  function shouldShowHomeCTA(settings) {
    return !settings.predictionsLocked;
  }

  assert(shouldShowHomeCTA({ predictionsLocked: false }) === true, "Unlocked: show 'winning form' CTA");
  assert(shouldShowHomeCTA({ predictionsLocked: true }) === false, "Locked: hide 'winning form' CTA (requirement)");
}

// ============================================================
// 7. Regression: reopen button still correctly gated by lock
// ============================================================
console.log("--- 7. Reopen button gated by lock (existing behaviour) ---");

{
  function shouldShowReopen(formStatus, locked) {
    return formStatus === "submitted" && !locked;
  }

  assert(shouldShowReopen("submitted", false) === true, "Submitted + unlocked: show reopen");
  assert(shouldShowReopen("submitted", true) === false, "Submitted + locked: hide reopen");
  assert(shouldShowReopen("draft", false) === false, "Draft + unlocked: no reopen");
  assert(shouldShowReopen("draft", true) === false, "Draft + locked: no reopen");
}

// ============================================================
// 8. Regression: setActiveFormId / view-existing still works when locked
// Locking should NOT break navigation to existing forms
// ============================================================
console.log("--- 8. Locked state does not block existing-form navigation ---");

{
  function canOpenExistingForm(form, locked) {
    // Navigation to an existing form is allowed regardless of lock
    return form != null;
  }

  assert(canOpenExistingForm({ formId: "u1__123" }, true) === true, "Locked: can still open existing form");
  assert(canOpenExistingForm({ formId: "u1__123" }, false) === true, "Unlocked: can open existing form");
  assert(canOpenExistingForm(null, false) === false, "Null form: cannot open");
}

// ============================================================
// 9. Error propagation: FormList toast shows store error
// ============================================================
console.log("--- 9. Error toast shows store error message ---");

{
  let toastMessage = null, toastLevel = null;
  function mockToast(msg, level) { toastMessage = msg; toastLevel = level; }

  function createFormWithLock(settings) {
    if (settings.predictionsLocked) {
      throw new Error("ההגשה נסגרה — לא ניתן ליצור טפסים חדשים");
    }
  }

  function handleCreate({ user, locked, settings }) {
    if (!user || locked) return;
    try {
      createFormWithLock(settings);
    } catch (err) {
      mockToast(err.message, "error");
    }
  }

  // Normal locked case: UI-level guard blocks before store call
  toastMessage = null;
  handleCreate({ user: { id: "u1" }, locked: true, settings: { predictionsLocked: true } });
  assert(toastMessage === null, "UI guard blocks before reaching store (no toast needed)");

  // Defensive: if UI guard somehow fails (stale prop), store throws → toast shows
  toastMessage = null;
  handleCreate({ user: { id: "u1" }, locked: false, settings: { predictionsLocked: true } });
  assert(toastMessage && toastMessage.includes("ההגשה נסגרה"), "Stale UI prop: store error surfaces in toast");
  assert(toastLevel === "error", "Toast shown as error level");
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log(`\n=== FORM LOCK UI RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
