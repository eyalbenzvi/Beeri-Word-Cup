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

## Known issues + migration backlog

- **PII exposure (security audit #4/#5/#39)**: `gameData/users` is
  readable by any authenticated user; UIDs are phone-derived. The fix
  needs a `gameData/userDirectory` doc with only `{uid: {displayName}}`
  for public reads + admin-only on the full users doc + client read
  paths to use the directory. Rules currently document the gap.
- **Per-user form cap in rules** (#26): client-side only; needs a
  counter doc for rule-level enforcement.
- **Vitest + RTL migration**: bash + grep is brittle; no JSX rendering
  tests today.
- **TypeScript**: no `tsconfig.json`. The `utils/` and `data/` modules
  are the highest-leverage incremental migration target.
- **store.js split**: 2k+ lines own audit (now extracted), Firestore
  CRUD, listeners, watchdog, public-readonly. Further splits planned
  but coordinated migrations only.
