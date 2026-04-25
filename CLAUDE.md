# Beeri World Cup — Project Guide

## Overview
Israeli World Cup 2026 prediction game. Users fill prediction forms for all 104 matches, submit them, and get scored when real results come in.

## Tech Stack
- **Frontend:** React 19 + Vite 8 + TailwindCSS 4
- **Backend:** Firebase (Firestore + Auth) — no custom server
- **Serverless:** Netlify Functions (SMS OTP, match analysis via Groq)
- **Hosting:** Firebase Hosting / Netlify

## Key Architecture
- **State management:** Custom store (`src/store.js`) with `useSyncExternalStore` subscriptions, Firestore real-time listeners, debounced writes
- **Auth:** Google sign-in (popup + redirect fallback for iOS/in-app browsers) + Phone OTP via Inforu SMS API
- **Phone auth flow:** Netlify function sends OTP via Inforu XML API → HMAC verification token (stateless) → Firebase custom auth token via Admin SDK
- **Phone user UID format:** `phone_05XXXXXXXX`
- **Form ID format:** `{userId}__{Date.now()}` (timestamp-based to avoid collision after deletion)
- **Match data:** 72 group + 32 knockout = 104 matches. All times in Israel time (IDT, UTC+3). Venues from FIFA Excel source.
- **Bracket system:** `src/utils/bracket.js` computes group standings, third-place qualification (495 scenarios), knockout advancement
- **Lazy loading:** Pages loaded via React.lazy() except Home and WelcomeScreen. Firebase in separate chunk.

## Directory Structure
```
src/
  pages/         — Home, Predict, Leaderboard, Results, Stats, Admin, Profile, AllForms, WelcomeScreen
  components/    — MatchCard, GroupTable, FormList, PlayerAutocomplete, PhoneSignIn, etc.
  data/          — matches.js (schedule+venues), teams.js (48 teams), players.js (170 top scorer candidates)
  hooks/         — useStore.js (central state), useCountdown.js, useNavigation.jsx
  utils/         — bracket.js, scoring.js, fifaPredictor.js, helpers.js
  store.js       — Firestore cache, CRUD, real-time listeners, auth
  firebase.js    — Firebase init, Google/Phone auth
netlify/functions/ — phone-send-otp.js, phone-verify-otp.js, match-analysis.js
tests/           — 16 test suites, 2340+ tests, run via ./tests/run-all.sh
```

## Important Files
- `src/store.js` — Central state: cache, Firestore listeners, form CRUD, user management, predictions
- `src/hooks/useStore.js` — React hooks wrapping store. `useCurrentUser()` subscribes to both `isStoreReady` AND `getUsers` (needed for new user creation reactivity)
- `src/data/matches.js` — All 104 matches with Israel times, venues, knockout bracket structure. `MATCH_VENUES` lookup by FIFA match number.
- `firestore.rules` — Security: `formId.matches(request.auth.uid + '__.*')`, locked predictions guard
- `docs/brand-book.md` — Visual language source of truth (colors, typography, components, motion, voice). Always consult before UI work.

## Common Patterns
- Match times are Israel time (IDT, UTC+3), converted from local host-city times
- KICKOFF: `2026-06-11T21:00:00Z` = Jun 12 00:00 Israel time
- Top scorer: closed player list with admin refresh capability. Validation on submit rejects free-text.
- Lock text: "המשחקים התחילו — ההגשה נסגרה" (not "נעולה")
- Knockout labels: W77-style codes hidden from display via regex filter

## Testing
```bash
./tests/run-all.sh  # Runs all 16 test suites (2340+ tests)
npx vite build      # Verify build succeeds
```

## Side-effect / regression discipline (during development)
For every code change, before declaring it done, audit these vectors **as
part of the development**, not after the fact:
- **Other consumers of changed APIs** — `grep` for every caller of any
  function/hook/exported symbol that changed. Confirm none silently break.
- **Failure paths** — for any new conditional that depends on async state
  (network fetch, listener, store readiness flag), trace the failure case:
  what does the UI show if the data never arrives? Add a fallback so the
  user is never trapped on a loading spinner forever.
- **Auth/state transitions** — if the change touches store cache, listener
  setup, or `_ready` flags, walk through: guest→login, login→logout, public-
  readonly→authenticated, and tab-visibility-change. Confirm the new
  behaviour is correct in each.
- **Race conditions** — first render vs. async-arrived data. The store
  defaults are NOT the same as "loaded data" — gates that decide visibility
  must distinguish "we know it's X" from "we haven't asked yet".
- **Add a regression test** — at minimum a static assertion in the relevant
  `tests/test-*.mjs` suite that the fix's pattern is in place.

## Environment Variables (Netlify)
- `INFORU_API_TOKEN`, `INFORU_USERNAME`, `INFORU_SENDER` — SMS via Inforu
- `FIREBASE_SERVICE_ACCOUNT` — Firebase Admin SDK (JSON)
- `OTP_SECRET` — HMAC signing for stateless OTP verification
- `GROQ_API_KEY` — AI match analysis

## Git Workflow
- Base branch: `claude/world-cup-prediction-game-uh4c5`
- Feature branch: `claude/improve-form-ux-g5hAK`
- Always rebase on base before push, squash merge PRs
