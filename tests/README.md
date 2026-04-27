# Test suite

`./tests/run-all.sh` runs all suites sequentially via Node ESM. Each test
file is a `.mjs` module that prints exactly one terminating line of the
form `<N> passed, <M> failed`. The harness:

- Captures stdout + stderr per file.
- Captures the exit code: a non-zero exit alongside a passing line is
  reported as `[HARD-FAIL exit=N]` (this catches crashes-after-passing-
  block, which `tail -1` historically masked).
- Surfaces tests that print no summary as `NO-SUMMARY (silent test, exit=N)`.

## Loader

Some test files import from the live `src/` tree, which uses Vite-style
specifiers without `.js` extensions (e.g. `import x from "./foo"`).
Node-strict ESM can't resolve those, so we ship a tiny resolver shim:

- `tests/loader.mjs` — vanilla resolver: appends `.js` to relative
  imports lacking an extension.
- `tests/loader-jsx.mjs` — same plus `.jsx` handling for tests that
  need to import a real React component.

The third column in `run-all.sh` opts each test into the right loader:
`"no"` (no loader, plain Node), `"yes"` (loader.mjs), `"jsx"` (loader-jsx).

Tests that don't need to import the React tree (pure utility tests,
static-audit greps) prefer `"no"` — fewer moving parts and faster start.

## Layout

Tests are grouped into topic subfolders. Loaders, fixtures, and the
runner stay at the root.

```
tests/
  loader.mjs, loader-jsx.mjs, run-all.sh, vitest.setup.js   harness
  excel-comparison-data.json, excel-rounds/, python_reference.py,
  scoring-verification.html, google-apps-script-compare.js   fixtures

  bracket/   group standings + knockout bracket math, schedule, sims,
             cross-validation against Excel/Python references, prediction
             alignment, simulator parity, scenario predictor, expert-
             analysis fix, rank consistency
  scoring/   scoring + tiebreakers + differential + Hebrew topScorer +
             scoring-verification HTML generator
  store/     store state, listeners, watchdogs, audit log, sentry wrapper,
             functions-contract, comprehensive bug detection, form-name
             default, reopen-form, constants dedup, user-data protection,
             stuck-loading protection
  perf/      perf regressions (leaderboard cache, listener retry & hash,
             bracket cache, batch limit)
  ui/        UI invariants — RTL/BiDi, tap targets, shared components,
             aria, focus traps, layout shells, empty states, profile/
             leaderboard consistency, navigation URL params, micro-copy,
             upcoming-matches integration, AI fill display, score auto-
             init, selection-and-champion, profile features
  auth/      phone OTP HMAC + token replay + auth-copy consistency
  summary/   blog/summary editor + public mode + AI hardening + review
             regressions + Firestore-rules contract
  data/      pure data — match-time parsing, upcoming-matches selector,
             player search/display (Hebrew), top-scorer selection
```

Tests reference source files via paths relative to the repo root
(`readFileSync("src/...")` from cwd, or `resolve(__dirname, "..", "..")`
for `__dirname`-based paths). Run from the repo root: `./tests/run-all.sh`.

## Migration plan: Vitest + React Testing Library

The current bash + grep harness is brittle and JSX-blind. There is no
JSX rendering coverage today — components are tested only via static
source-string greps. The migration is open scope; the rough plan:

1. `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
2. Add `vitest.config.js` with `environment: 'jsdom'` + `setupFiles`
   importing `@testing-library/jest-dom/vitest`.
3. Switch `package.json` script `"test": "vitest run"` (keep the bash
   harness as `"test:legacy"` until conversion is complete).
4. Convert tests in priority order:
   - **High value first**: `test-bidi-scores`, `test-shared-components`
     (already JSX-aware). Trivially become RTL render assertions.
   - **Pure logic**: `test-bracket`, `test-scoring`, `test-edge-cases` —
     mechanical conversion: replace ad-hoc `assert(c, msg)` with
     Vitest `expect(c).toBe(true)`.
   - **Store logic**: needs a small Firestore mock. The existing
     `test-store-logic` already mocks via dependency injection.
5. Add component-level RTL coverage for the highest-traffic flows:
   - Predict edit → validate → submit
   - Profile setup
   - Phone OTP send + verify (mocking the Netlify function)

Until then, every new test should still print `<N> passed, <M> failed`
on its last line so the run-all.sh harness can surface real failures.

## Adding a new test

1. Pick the right topic folder (see Layout above) and create
   `tests/<topic>/test-<name>.mjs`.
2. Top of file: a small `assert` helper + `passed/failed` counters.
3. Bottom of file:
   ```js
   console.log(`\n=== <TOPIC>: ${passed} passed, ${failed} failed ===`);
   process.exit(failed > 0 ? 1 : 0);
   ```
4. Add a `run_test "<N>. <Title>" "<topic>/test-<name>.mjs" "<loader>"`
   line in `run-all.sh`.
5. Run `./tests/run-all.sh`; the new test should report and the total
   should increase by your test count.

When importing from `src/`, use `../../src/...` (two levels up from the
topic folder). Same for `../../netlify/...`. For `__dirname`-based path
roots, use `resolve(__dirname, "..", "..")`.
