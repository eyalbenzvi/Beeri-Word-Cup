# Beeri World Cup — Architecture

This document describes the runtime architecture for human contributors.
For Claude-Code-pair-programming notes, see `CLAUDE.md` at the repo root.
For the visual language (colors, typography, components), see
`docs/brand-book.md`.

## Top-level overview

A React 19 + Vite SPA backed by Firebase (Firestore + Auth) and a small
set of Netlify Functions. There is no traditional backend server; all
mutating writes go through Firebase rules, with Netlify Functions used
only for things that can't (or shouldn't) run in the browser:

- **`phone-send-otp`** + **`phone-verify-otp`** — SMS OTP via Inforu's XML
  API, HMAC-signed verification token, exchanged for a Firebase custom
  auth token via the Admin SDK.
- **`set-admin-claim`** — promotes / demotes a UID via `setCustomUserClaims`.
- **`match-analysis`** — Groq-backed match preview (one call per
  open-analysis tap, idToken-gated).
- **`summary-ai`** — Groq-backed prose helper for the admin blog editor
  (admin-gated, rate-limited).
- **`get-public-settings`** + **`get-public-summaries`** + **`og-summary`** —
  read-only server views used by guests on the blog page (no auth) so
  Firebase rules can stay restrictive.

Hosting is on Firebase Hosting and/or Netlify; both targets are
configured (`firebase.json` + `netlify.toml`).

## Client state model

The browser holds one ambient store, defined in `src/store.js`:

- A plain `cache` object keyed by domain (`predictions`, `users`,
  `matchResults`, `actualBonuses`, `settings`, `summaries`).
- Real-time Firestore listeners that hydrate the cache (`initRealtimeListeners`).
- A `_ready` map tracking which listener has produced its first snapshot,
  so the app can hold the splash until everything that's needed has
  landed (`isStoreReady` / `useStoreReady`).
- `useSyncExternalStore`-friendly `subscribe` / `getSnapshot` so React
  components subscribe with native scheduling semantics.
- A `keyed` event API (`subscribeToKey`) so a component that only cares
  about, say, `predictions` doesn't re-render when a single user
  document touches `lastLoginAt`.
- A debounced write path (`debouncedWriteForm`) that batches per-form
  edits into a single `setDoc` 500ms after the last keystroke; flushed
  immediately on `pagehide` / submit / explicit save.

Reads come back through `src/hooks/useStore.js`, which exposes typed-ish
hooks (`useCurrentUser`, `useUserForms`, `useMatchResults`, etc.).

### Persistent local cache

`firebase.js` enables IndexedDB persistence
(`persistentLocalCache({tabManager: persistentMultipleTabManager()})`).
Two consequences worth remembering:

1. Pending writes survive a tab kill — the SDK replays them on the next
   session. This is what saves a user's last 500ms of edits when iOS
   backgrounds the page mid-debounce.
2. Multi-tab is supported; the leader-election manager arbitrates
   listener ownership so a hidden tab doesn't burn quota.

### Auth flow

- **Google** sign-in goes through `signInWithPopup` with redirect
  fallback for in-app browsers (iOS WhatsApp, FB, etc.) and popup
  blockers (`signInWithGoogle`).
- **Phone** sign-in is fully bespoke. The browser asks
  `phone-send-otp` to text a code; the function returns an HMAC-signed
  `verificationToken` (state is held server-side only as a brute-force
  counter doc). The browser submits `{token, code}` to
  `phone-verify-otp`; the function verifies HMAC + counter +
  `Date.now() < expiresAt` and mints a Firebase custom token via Admin
  SDK with UID `phone_05XXXXXXXX`.
- `useCurrentUser` listens to `onAuthStateChanged` and bridges into the
  store via `ensureUserInStore`.
- After `15s` (`READY_WATCHDOG_MS`) without a user record landing, a
  Sentry watchdog fires — surfaces the "stuck loading ball" class of bug.

### Public-readonly mode

`/blog` is shareable as a URL (WhatsApp etc.) and must render for guests.
`App.jsx` short-circuits the WelcomeScreen for `page === "blog"` while
`!isLoggedIn`, and `initPublicReadonlyMode` flips the store to a
"server-fetched, no-listener" mode that uses
`get-public-settings` + `get-public-summaries` instead of Firestore
listeners. This deliberately doesn't surface user-form names so a
guest leak is bounded to summary content + admin-published copy.

## Tournament data model

- `src/data/teams.js` — 48 finalists, grouped A–L (4 each).
- `src/data/matches.js` — 72 group + 32 knockout = 104 matches. Source
  of truth for kickoff times (Israel-time strings) and venues. The
  knockout bracket structure (`R32_MATCHES`, `R16_MATCHES`, …) encodes
  which match feeds which.
- `src/data/players.js` — closed list of 170 top-scorer candidates.
- `src/data/thirdPlaceTable.js` — 495-row lookup of the FIFA Annex H
  third-place qualification scenarios.
- `src/data/fifaRanking.js` — single source for both the official FIFA
  ranking (used as a regulatory tiebreaker in `bracket.js`) and a dense
  1..48 view (used by `fifaPredictor.js`).
- `src/utils/bracket.js` — `calcGroupStandings`, `calcBracketTeams`,
  `deriveAdvancingTeams`, `deriveActualAdvancing`, `deriveChampion`.
- `src/utils/bracketCache.js` — content-keyed memoization (FNV-1a hash)
  so the leaderboard view can compute 200+ forms × 104 matches in real
  time.
- `src/utils/scoring.js` — `calculateFullScore`, `compareTiebreaker`.

## Form lifecycle

```
draft  ──▶  pending  ──▶  submitted    ◀── admin transitions only
   ▲           │              │
   └───────────┴──────────────┘  user can re-open before lock
                                  (rules: !isLocked()
                                   AND validUserStatusTransition)
```

- **Form ID format**: `<userId>__<Date.now()>`. Timestamp-based to avoid
  collision after deletion. Rule-enforced regex
  `^<uid>__\d{10,16}$`.
- **Lock**: `gameData/settings.predictionsLocked` (admin-flipped) gates
  every user write at the rule level. UI shows
  `"המשחקים התחילו — ההגשה נסגרה"`.
- **Per-form cap**: `MAX_FORMS_PER_USER = 10` enforced client-side
  (rule-level enforcement would need a counter doc — open).

## Critical files map

| File | Responsibility |
|------|----------------|
| `src/store.js` | Ambient state, Firestore CRUD, listener orchestration, debounced writes, public-readonly mode, audit log integration. The single biggest module. |
| `src/storeAudit.js` | Local audit-log ring buffer (`wc2026_audit_log` localStorage key). Single source. |
| `src/hooks/useStore.js` | All `use*` hooks, watchdogs, auth bridge. |
| `src/hooks/useNavigation.jsx` | URL-driven page state with Back/Forward + scroll restoration. |
| `src/hooks/useFocusTrap.js` | Keyboard focus trap for dialogs (used by modals + MenuOverlay). |
| `src/utils/constants.js` | `KICKOFF_UTC`, `STAGE_LABELS`, `KNOCKOUT_STAGE_ORDER`, `MAX_*_LIMIT` constants, batch limit. |
| `src/utils/helpers.js` | `isScoreValid`, `normalizeStatus`, `preferredScrollBehavior` (reduced-motion-aware). |
| `firestore.rules` | The only authoritative authorization layer. Mirrors several client constants — keep in sync. |
| `src/components/ErrorBoundary.jsx` | Both root + per-page boundary; resetKey clears state on navigation. |
| `src/firebase.js` | Firestore init (auto-detect long-polling, persistentLocalCache), Auth helpers. |
| `src/sentry.js` | `captureClientError` + `captureClientMessage` with replay + masked text. |

## Environment / deployment

Netlify Functions need:

- `INFORU_API_TOKEN`, `INFORU_USERNAME`, `INFORU_SENDER`
- `FIREBASE_SERVICE_ACCOUNT` (JSON)
- `OTP_SECRET` (HMAC signing)
- `GROQ_API_KEY`
- `ALLOWED_ORIGINS` (CSV; production deploys must set this)

Vite build emits chunked assets; Firebase chunk is intentionally
isolated. Public sourcemaps are shipped on purpose (no secrets in client
code).

## Testing

`./tests/run-all.sh` runs all suites and exits non-zero on any failure
or hard-crash (since the run-all.sh harden in this branch). Each suite
must terminate with a `<N> passed, <M> failed` line; silent crashes are
surfaced as `NO-SUMMARY (silent test, exit=N)`.

Test taxonomy (loose):

- `test-bracket.mjs`, `test-thirdplace.mjs`, `test-edge-cases.mjs`,
  `test-excel-crossval.mjs` — bracket / third-place math.
- `test-scoring.mjs`, `test-scoring-differential.mjs` — scoring.
- `test-store-logic.mjs`, `test-load-and-users.mjs`,
  `test-comprehensive-bugs.mjs` — store + ambient state.
- `test-performance-fixes.mjs`, `test-performance-fixes-v2.mjs` —
  perf regressions.
- `test-bidi-scores.mjs`, `test-tap-targets.mjs`,
  `test-shared-components.mjs` — UI invariants (static audit).

There is no Vitest / RTL setup yet — see migration backlog.

## PII migration (audit #4/#5/#39)

User data is being split across three Firestore locations to fix the
historical leak where every authenticated member could read every other
member's email + isAdmin flag + last-login from a single shared doc.

### Shapes

- **`gameData/users`** — legacy full record `{ data: { uid: {...} } }`.
  Kept dual-written during the compat window. Read = any auth user
  today; tightened to admin-only after the cut-over PR.
- **`gameData/userDirectory`** — `{ data: { uid: { displayName,
  firstName?, lastName? } } }`. Auth-readable. The directory is the
  source of truth for non-admin display data on the leaderboard,
  AllForms, daily summary, simulator, summary editor.
- **`userPrivate/{uid}`** — per-user private record: `{ id, email,
  isAdmin, profileCompleted, lastLoginAt, createdAt, photoURL? }`.
  Read = owner OR admin. Owner-create requires `isAdmin == false`;
  owner-update can only touch `email / profileCompleted /
  lastLoginAt / photoURL`.

### Phase A — additive (this PR)

- New rules deployed for `userDirectory` + `userPrivate` (additive — no
  legacy access tightened yet).
- `src/store.js` dual-writes every user mutation across all three
  locations atomically via `writeBatch`. Field classification lives in
  two arrays: `DIRECTORY_FIELDS` and `USER_PRIVATE_FIELDS`.
- New listeners populate `cache.userDirectory` (single doc) and
  `cache.userPrivate[currentUid]` (per-uid).
- New hook `useUserDirectory()` returns the directory map. Non-admin
  consumers were migrated off `useUsers()` to it (Leaderboard,
  AllForms, DailySummary, SimulatorPanel, SummaryEditor).
- `set-admin-claim` Netlify function dual-writes `isAdmin` to both
  legacy users and `userPrivate/{uid}`.
- `importAllData` re-derives directory + userPrivate from the imported
  legacy users blob; backups round-trip correctly.
- `clearAllData` wipes the userPrivate collection too.
- Static rules-grep regression test
  (`tests/store/test-firestore-rules-pii.mjs`) catches drift in field
  classification / rule structure / consumer migration.
- Migration script `scripts/migrate-userDirectory.mjs` backfills the
  new locations from the legacy doc, idempotent + safe to re-run.

### Migration runbook (run after Phase A merges, before Phase B)

1. **Backup.** Use the admin tab "Export all data" to save a JSON
   snapshot. Verify the file opens and counts look right.
2. **Lock the tournament** (admin tab → settings → predictionsLocked = true).
3. **Dry-run the script.** From a machine with the Firebase service
   account JSON:

   ```sh
   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
     node scripts/migrate-userDirectory.mjs --dry-run --verbose
   ```

   Eyeball the planned writes. Counts should match the legacy users doc.
4. **Real run.** Same command with `--confirm-prod` instead of
   `--dry-run`. Re-running is safe — only differing entries are
   re-written.
5. **Spot-check** in the Firebase Console:
   - `gameData/userDirectory.data` has one entry per user.
   - `userPrivate/{adminUid}` exists with `isAdmin: true`.
   - `userPrivate/{regularUid}` exists with `isAdmin: false`.
6. **Unlock** the tournament.
7. **Watch Sentry** for `userPrivateListener-permission-denied` events
   over the next 24 h. None expected; if any appear, investigate before
   proceeding to Phase B.

### Phase B — cut-over (this PR)

After Phase A's migration script runs in production, Phase B:

1. Tightens the `gameData/users` **read rule** to admin-only. Settings is
   still public; everything else under `gameData/{docId}` is auth-readable.
2. Switches the `isAdmin()` rule helper's Firestore fallback from
   `gameData/users.data[uid].isAdmin` to `userPrivate/{uid}.isAdmin`,
   guarded by an `exists()` check so a missing private doc resolves
   cleanly to "not admin" rather than a rule evaluation error.
3. Teaches `src/store.js`'s gameDoc listener that `permission-denied`
   on the legacy users doc is the **expected** state for non-admins —
   it flips `_ready.users = true` (cache stays empty `{}`) and skips
   the retry loop. No Sentry noise.
4. Updates the upgrade-decision helpers (`maybeUpgradePredictionsListener`
   / `setupSummariesListener` / `maybeUpgradeSummariesListener`) to
   consult `cache.userPrivate[uid].isAdmin` as the new source of truth,
   with the legacy `cache.users[uid].isAdmin` kept as a fallback.
5. Updates `store.getUser()` to merge from `userDirectory + userPrivate`
   when `cache.users` is empty, so own-user reads (Profile.jsx,
   `getCurrentUser()`, `requireAdmin()`) keep working for non-admins.
6. `useCurrentUser` subscribes to `getUserPrivateMap` so updates to the
   user's own private record (e.g. `lastLoginAt`, `profileCompleted`)
   trigger re-renders.

The legacy `gameData/users` doc is still **dual-written** by store.js
and `set-admin-claim`. It's no longer read by Firestore rules, and no
longer read by non-admin clients, but admin tabs (`AdminUsersTab`,
`AdminToolsTab`, `Admin.jsx`) continue to consume it as the full
membership listing. Dropping the dual-write is a separate cleanup PR
once the admin tabs migrate to a collection-query of `userPrivate/*`
or a derived view.

### Residual issue

UIDs are still phone-derived (`phone_05XXXXXXXX`) so any signed-in
member can derive any other member's mobile number from form IDs
(`<uid>__<ts>`). Addressed by the random-hashed-UID migration below.

## Random hashed UIDs (audit Task 2)

The legacy phone-auth UID format `phone_05XXXXXXXX` embeds the user's
phone number, which then leaks into:

- Prediction form IDs (`<uid>__<ts>`) — visible to every signed-in user
  on AllForms / Leaderboard.
- Audit log entries (`userId` field).
- Sentry events (set as `user.id`).

The fix is to mint UIDs of the form `phone_<16 hex>` derived as
`SHA-256(salt + phone).slice(0, 16)`. Same input + same salt → same UID
(deterministic so the verify-OTP function can resolve a returning user
to the right Firestore data), but the phone is not recoverable from the
UID.

### Components

- **`src/utils/uidHash.ts`** — `deriveHashedUid(phone, salt)`,
  `isPhoneUid(uid)`, `PHONE_UID_PREFIX`. Throws on empty inputs.
- **`netlify/functions/phone-verify-otp.js`** — Resolves the UID at
  login time. If `USE_HASHED_UID === "true"` AND `OTP_SALT` is set:
  computes the deterministic hashed UID, then consults
  `gameData/uidMigrationMap` for an explicit override (takes
  precedence so the map can survive a salt rotation). Otherwise stays
  on the legacy `phone_<phone>`. The custom token no longer carries
  the phone in its claims.
- **`scripts/migrate-uids.mjs`** — Idempotent migration tool. Refuses
  to run unless predictions are locked. Detects hash collisions before
  any writes. Per-user `writeBatch` rewrites predictions
  (`<legacy>__<ts>` → `<hashed>__<ts>`), `userPrivate/{uid}`,
  `userDirectory[uid]`, `gameData/users[uid]`, then records the
  legacy → hashed entry in `gameData/uidMigrationMap`. Optional
  `--revoke-tokens` invalidates server-side sessions for the legacy
  UID.
- **Firestore rule** — `gameData/uidMigrationMap` is admin-only for
  both read AND write. Exposing it to authed users would re-leak the
  phone number via the legacy-UID side of the mapping.
- **`src/sentry.ts`** — Defense-in-depth: `beforeBreadcrumb` +
  `beforeSend` strip the legacy `phone_<10-digit>` pattern from
  outgoing events. Hashed UIDs (16 hex chars) pass through unchanged.
- **`tests/store/test-uid-hash-migration.mjs`** — Static rules + code
  grep that pins all of the above invariants.

### Migration runbook (separate maintenance window)

Code is **inert** until you set both `OTP_SALT` and `USE_HASHED_UID=true`
on Netlify. The PR can land months before flipping the switch.

1. **Generate a salt.** `node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'`
   Save it in your password manager — losing it means every existing
   phone user gets a brand-new UID and orphans their data. Set
   `OTP_SALT` on Netlify (do **not** redeploy yet).
2. **Backup.** Export all data from the admin tab. Verify the JSON
   opens and counts look right.
3. **Lock the tournament** (admin tab → predictionsLocked = true). The
   migration script refuses to run otherwise — predictions get renamed
   en masse and a mid-edit user would lose writes.
4. **Dry-run the migration** from a machine with the service account:

   ```sh
   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
   OTP_SALT=<the same salt you set on Netlify> \
     node scripts/migrate-uids.mjs --dry-run --verbose
   ```

   Eyeball the planned `legacy → hashed` lines. The script aborts
   before any writes if it detects a hash collision (astronomically
   unlikely, but check).
5. **Real run.** Same command with `--confirm-prod` (and optionally
   `--revoke-tokens` if you want to invalidate active sessions). It's
   idempotent — re-running skips already-migrated users.
6. **Spot-check** in the Firebase Console:
   - `gameData/uidMigrationMap.data` has one entry per migrated user.
   - `gameData/users.data` no longer contains `phone_05*` keys.
   - A sample prediction's formId begins with `phone_<hex>__`.
7. **Flip the flag.** Set `USE_HASHED_UID=true` on Netlify and
   redeploy `phone-verify-otp`. Now new logins resolve to hashed UIDs.
8. **Smoke test.** Log in with a test phone account. The custom
   token's `sub` claim should be `phone_<hex>`. Confirm you can read
   your own predictions.
9. **Unlock** the tournament.
10. **Salt rotation** (rare): change `OTP_SALT`, rerun
    `migrate-uids.mjs --confirm-prod` — it will detect that
    `existingMap` already maps each legacy UID and skip them. To
    actively rotate every UID, drop `gameData/uidMigrationMap` first.

### Rollback

If something breaks AFTER step 7 but BEFORE significant new data has
been written: set `USE_HASHED_UID=false` and redeploy. New logins go
back to the legacy UID, which is empty post-migration; users will
appear to have lost their data. To restore, either:

- Re-flip the flag and debug forward (preferred), OR
- Restore from the Phase 2 backup (admin tab → Restore).

Because migrated data is at the new hashed UID and the verify-OTP
function looks up the same hashed UID on every login, the
flag-on/flag-off boundary is the only meaningful failure mode.

## Other migration backlog

- **Per-user form cap in rules** (#26): client-side only; needs a
  counter doc for rule-level enforcement.
- **Vitest + RTL migration**: bash + grep is brittle; no JSX rendering
  tests today.
- **TypeScript**: no `tsconfig.json`. The `utils/` and `data/` modules
  are the highest-leverage incremental migration target.
- **store.js split**: 2k+ lines own audit (now extracted), Firestore
  CRUD, listeners, watchdog, public-readonly. Further splits planned
  but coordinated migrations only.
