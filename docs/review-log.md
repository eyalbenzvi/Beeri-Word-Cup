# Review Log — Auth / User / Login Flow

Running record of what has been reviewed, fixed, or left open in the
auth/user/login area. **Feed this file to the next review** as context so
Claude (or a human) doesn't re-discover the same findings.

How to use:
- Before a new review, read the Fixed table and the Known-Open list.
- New findings: add them to Known-Open with a date + source (review session
  URL or PR that surfaced them).
- When something ships, move it to Fixed with its PR number and a one-liner
  describing what the trap was.
- Things you decided not to fix go in Accepted-Risk with a short reason.

Last updated: 2026-04-16

---

## Fixed (with PR link)

Most recent first. "Trap" = the user-visible symptom; "Fix" = the shape of
the resolution (not the diff).

| PR | Date | Trap | Fix |
|---|---|---|---|
| [#76](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/76) | 2026-04-16 | New/returning users stuck on loading spinner after sign-in: `ensureUserInStore` wrote a partial payload the Firestore rule rejected, SDK reverted optimistic cache, user record disappeared. Also: Safari ITP blocking `onAuthStateChanged` from ever firing. | Bounded retry (3/uid), `lastEnsuredUid` only committed on success, single-flight guard, getDoc disambiguates cache-desync vs genuinely-new user, optimistic-revert detection, per-uid one-shot token refresh on `permission-denied`, 8s auth-init watchdog, 12s "Reload / Sign out & start over" escape-hatch. Full Sentry coverage of the previously-silent failure paths. |
| [#74](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/74) | 2026-04-16 | Every auth/store failure was `console.error` only — bugs were invisible in production. | `@sentry/react` + `@sentry/node`. Client-side ErrorBoundary + user context. `withSentry(handler, name)` wrapper for Netlify functions. Source maps enabled. |
| [#72](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/72) | 2026-04-16 | Returning user's Firestore record (isAdmin, firstName, lastName) wiped to defaults when listeners hadn't populated cache but `_ready.users` was already `true`. | When other users are in cache (proving listeners are live) but the current uid isn't, use per-field `updateUserField` instead of full-record `createUserField`. Full-object create is only used when cache is genuinely empty. |
| [#66](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/66) | 2026-04-14 | Listener failures produced a user-facing error screen with a retry button — UX regression vs. silent recovery. Auth redirect errors shown as toast were noisy. | Persistent retry with exp backoff (2s→4s→8s→16s→30s cap), re-triggered on `online` and `visibilitychange`. Fallback from realtime listener → one-shot `getDocs` → keep retrying. Removed `LoadError`, `storeError`, `useStoreError`, timeout, WelcomeScreen redirect-error UI. |
| [#65](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/65) | 2026-04-14 | Single shared retry counter meant one listener's failures burned the budget for all; infinite ⚽ spinner on permission-denied. (Later refined by #66.) | Per-key retry state + fallback to one-shot `getDoc`. 25s safety-net timeout (later removed in #66). AllForms bracket now lazy-computed. |
| [#63](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/63) | 2026-04-13 | Client-side admin check alone was the only gate; `BroadcastChannel` + upgrade timer leaked across logout; Profile state stale after external updates; admin could overwrite another user's `userId` on forms. | `requireAdmin` on 14 store functions, Firebase Custom Claims via `set-admin-claim` Netlify function (Firestore rules accept both during migration), immutable `userId` enforced in rules, BroadcastChannel + upgrade timer cleaned up on logout, Profile syncs local state from Firestore when not editing. |
| [#60](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/60) | 2026-04-13 | `Math.random` OTP was guessable; non-timing-safe HMAC compare; no OTP rate-limit; CORS wildcard; debounced form writes silently dropped when predictions locked; BroadcastChannel didn't sync active form across tabs. | `crypto.randomInt` OTP, `crypto.timingSafeEqual` HMAC compare, per-phone + per-IP OTP rate limit, brute-force limit on verify, CORS allow-list, Firestore rules block form delete after lock + validate audit log, pending writes cleared before `deleteForm`, **activeForm** (not currentUser) synced cross-tab via BroadcastChannel. |
| [#56](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/56) | 2026-04-12 | No phone-based sign-in for users without a Google account. | Added phone auth via Inforu SMS. `phone-send-otp` (HMAC stateless token, 5-min expiry) + `phone-verify-otp` (creates Firebase custom token). UID format `phone_05XXXXXXXX`. |
| [#54](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/54) | 2026-04-12 | Google sign-in failed on iOS Safari and in-app browsers (WhatsApp/FB/Instagram) with `auth/missing-initial-state`. | UA-sniff in-app browsers → `signInWithRedirect` fallback. `getRedirectResult(auth)` on module load to complete redirect returns. Popup-blocked fallback to redirect on mobile. |
| [#53](https://github.com/eyalbenzvi/Beeri-World-Cup/pull/53) | 2026-04-12 | New-user registration stuck on loading after Google sign-in until manual refresh — `useCurrentUser` only subscribed to `isStoreReady`, not to user-cache changes, so `ensureUserInStore` creating the record didn't trigger a re-render. | Added `useStoreValue(store.getUsers)` subscription inside `useCurrentUser`. Removed redundant `ensureUserInStore` call from `GoogleSignInButton`. |

---

## Known-Open (from review 2026-04-16)

Findings from the current review that are NOT already covered by a merged PR
above. Items that overlap with the Fixed list have been dropped.

### HIGH

**O-1. Phone ↔ Google identity split (no account linking)**
- **Where:** `netlify/functions/phone-verify-otp.js:95` (UID `phone_05XXXXXXXX`);
  `src/store.js:748-843` (`ensureUserInStore`).
- **Trap:** A single human who signs in once with Google and once with phone
  gets two separate Firestore user records and two separate leaderboard rows.
  If they "lose" one login path they silently lose their forms.
- **Why still open:** Phone auth is relatively new (PR #56). No merging
  strategy exists in code.
- **Direction:** Firebase `linkWithCredential` at the auth layer, or a
  server-side phone-number → primary-uid mapping in Firestore.

**O-2. `currentUser` not in BroadcastChannel cross-tab sync**
- **Where:** `src/store.js:709-729` (BroadcastChannel only handles
  `activeForm-changed`); `src/store.js:967-970` (`setCurrentUser` writes
  localStorage without broadcasting).
- **Trap:** Tab A logs in as Alice, Tab B (opened earlier under Bob) shows
  Bob's profile even though Firebase Auth is now Alice.
- **Why still open:** PR #60 added BroadcastChannel but only wired `activeForm`.
- **Direction:** Add `currentUser-changed` to the broadcast channel,
  re-read `wc2026_currentUser` on receive, re-notify subscribers.

**O-3. Form writes not flushed on `online` event**
- **Where:** `src/store.js:354-372` (`flushPendingWrites` bound only to
  `visibilitychange`); `src/store.js:572-579`.
- **Trap:** User edits offline, network comes back but tab stays visible,
  snapshot from server arrives first and clobbers the pending (debounced)
  form write. PR #66 fixed the listener side but not the write side.
- **Direction:** Also bind `flushPendingWrites` to `window.addEventListener(
  "online", ...)` and flush before re-subscribing the listener.

### MEDIUM

**O-4. OTP 5-minute token expiry with no client countdown**
- **Where:** `netlify/functions/phone-verify-otp.js:72` rejects after
  `Date.now() > expiresAt`. `src/components/PhoneSignIn.jsx:13-21` only tracks
  a 60-second resend cooldown.
- **Trap:** User switches apps to read the SMS, comes back slowly, enters the
  code → "הקוד פג תוקף. שלח קוד חדש". No warning that the clock was running.
- **Direction:** Show remaining expiry in the code step (simple `setInterval`
  off `otpData.expiresAt`), auto-prompt "Resend code" when it hits 0.

**O-5. In-app browser post-redirect has no UI feedback on failure**
- **Where:** `src/firebase.js:32-38` catches `getRedirectResult` errors,
  logs to Sentry (good), but never surfaces them.
- **Trap:** Facebook/Instagram in-app returns from Google with a redirect
  error (3rd-party cookie block, storage partition). User lands back on
  WelcomeScreen with no indication the flow failed, taps Google again, same
  result. Not a spinner-trap — a confidence-trap.
- **Prior attempt:** PR #65 added a toast; PR #66 removed it as noise.
- **Direction:** Surface a one-shot, dismissable banner only for the
  non-silent error codes — "something went wrong, try phone sign-in instead".

**O-6. Admin-demotion listener downgrade race**
- **Where:** `src/store.js:547-560` (`maybeUpgradePredictionsListener` reads
  `cache.users[uid].isAdmin`); `src/store.js:623-626` (called from both
  users-listener and settings-listener snapshots).
- **Trap:** User's admin flag is flipped off. Settings snapshot fires first,
  reads stale `cache.users`, keeps the listener in `showAll=true` mode. User
  continues seeing predictions they shouldn't until page reload.
- **Direction:** Debounce the upgrade check, or only trigger it from the
  users-listener path when `cache.users[uid].isAdmin` actually changed.

### LOW

**O-7. Stale `wc2026_currentUser` in localStorage on next cold start**
- **Where:** `src/store.js:947-955` (`getCurrentUser` trusts localStorage
  even when `auth.currentUser` is null).
- **Trap:** Tab crashes mid-logout before `logoutUser()` clears the key.
  On next cold start, `auth.currentUser` is null so `App.jsx` shows
  WelcomeScreen — OK — but any code that reads `store.getCurrentUser()`
  directly sees the stale uid. Minor; mostly cosmetic.
- **Mitigated:** PR #76's "Sign out & start over" clears it manually.
- **Direction:** In `useCurrentUser`'s `onAuthStateChanged(null)` branch
  (`src/hooks/useStore.js:71-74`), also clear the localStorage key, not just
  call `store.logoutUser()` (which already does, but only if the user was
  set via the store path).

**O-8. `ProfileSetup` skip has no offline escape**
- **Where:** `src/components/ProfileSetup.jsx:15-31`.
- **Trap:** Slow/3G user taps "דלג", `updateUserProfile` times out, sees
  "שמירה נכשלה". No way past the screen while offline.
- **Mitigated:** PR #76 made `updateUserProfile` return a boolean and shows
  the error instead of racing past. So the user now sees what happened — but
  still can't skip until the network cooperates.
- **Direction:** Either defer `profileCompleted=true` to a local flag that's
  written opportunistically next time the network is healthy, or add an
  "I'll do this later" button that sets a client-only bypass.

---

## Accepted-Risk

(Items the team has decided aren't worth fixing. Fill in as decisions are
made.)

- **In-memory OTP rate limits reset per Netlify cold start** — intentional
  cost/complexity tradeoff. (Ref: PR #60.)

---

## Review guidance for the next session

When asking Claude (or anyone) to review this area again, give them:

1. **This file** — so they start from the current known state instead of
   re-discovering shipped fixes.
2. **The scope** — e.g. "re-check everything in Known-Open; look for new
   items in `PhoneSignIn.jsx`". Narrow beats broad.
3. **A ban on rehash** — "if a finding overlaps with Fixed or Known-Open,
   skip it instead of renaming it". Reviews reward producing findings; push
   back against that gradient explicitly.
4. **What to do with novel findings** — "add to Known-Open with date + your
   session URL; don't implement". Keeps review and implementation separate.

Expected output from a review run:

- A diff against Known-Open: items you'd add, items you'd downgrade, items
  you'd close as false-positive.
- A short note on anything in Fixed that looks like it regressed (worth
  auditing when refactors land).
