#!/bin/bash
# Run all tests for Beeri World Cup
# Usage: ./tests/run-all.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
LOADER="$DIR/loader.mjs"
JSX_LOADER="$DIR/loader-jsx.mjs"
TOTAL_PASS=0
TOTAL_FAIL=0

echo "==========================================="
echo "  BEERI WORLD CUP — FULL TEST SUITE"
echo "==========================================="
echo ""

# Each test file must terminate with a line matching `<N> passed, <M> failed`
# (or the legacy "=== ... <N> passed, <M> failed ===" wrapper).
# Exit code is also captured: a non-zero exit from node (uncaught
# exception, syntax error, missing import) is reported as a HARD-FAIL even
# if the file printed an earlier "passed" line — previously `tail -1` of
# grep'd output silently swallowed a hard crash that happened after a
# passing block, because that earlier line was the only matching hit.
run_test() {
  local name="$1"
  local file="$2"
  local needs_loader="$3"

  echo -n "$name: "
  local out exitcode
  if [ "$needs_loader" = "jsx" ]; then
    out=$(node --loader "$JSX_LOADER" "$DIR/$file" 2>&1)
    exitcode=$?
  elif [ "$needs_loader" = "yes" ]; then
    out=$(node --loader "$LOADER" "$DIR/$file" 2>&1)
    exitcode=$?
  else
    out=$(node "$DIR/$file" 2>&1)
    exitcode=$?
  fi

  local result
  result=$(echo "$out" | grep -E "passed|failed" | tail -1)

  if [ -z "$result" ]; then
    echo "NO-SUMMARY (silent test, exit=$exitcode)"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    return
  fi

  local p f
  p=$(echo "$result" | grep -oP '\d+ passed' | grep -oP '\d+')
  f=$(echo "$result" | grep -oP '\d+ failed' | grep -oP '\d+')

  if [ "$exitcode" -ne 0 ]; then
    echo "$result  [HARD-FAIL exit=$exitcode]"
    TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
    TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0} + 1))
    return
  fi

  echo "$result"
  TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0}))
}

run_test "1. Scoring Logic" "scoring/test-scoring.mjs" "yes"
run_test "2. Bracket & Advancement" "bracket/test-bracket.mjs" "yes"
run_test "3. Third Place Table" "bracket/test-thirdplace.mjs" "yes"
run_test "4. FIFA Schedule" "bracket/test-schedule.mjs" "yes"
run_test "5. Edge Cases" "bracket/test-edge-cases.mjs" "yes"
run_test "6. Full Simulation" "bracket/test-full-simulation.mjs" "yes"
run_test "7. Leaderboard E2E" "bracket/test-leaderboard-e2e.mjs" "yes"
run_test "8. Store Logic" "store/test-store-logic.mjs" "no"
run_test "9. Load & User Mgmt" "store/test-load-and-users.mjs" "yes"
run_test "10. Functions & API Contract" "store/test-functions-contract.mjs" "no"
run_test "11. Comprehensive Bug Detection" "store/test-comprehensive-bugs.mjs" "no"
run_test "12. Profile Features" "ui/test-profile-features.mjs" "no"
run_test "13. External Cross-Validation (300 trials)" "bracket/test-external-crossval.mjs" "yes"
run_test "14. Excel Cross-Validation (FIFA bracket)" "bracket/test-excel-crossval.mjs" "yes"
run_test "15. Python Cross-Validation (100 trials)" "bracket/test-python-crossval.mjs" "yes"
run_test "16. Phone Auth & OTP Security" "auth/test-phone-auth.mjs" "yes"
run_test "17. Bracket Cache Fix" "perf/test-bracket-cache.mjs" "yes"
run_test "18. Batch Limit Fix" "perf/test-batch-limit.mjs" "no"
run_test "19. Performance Fixes (Leaderboard Cache)" "perf/test-leaderboard-cache.mjs" "yes"
run_test "20. Audit Fix Regression Tests" "store/test-audit-fixes.mjs" "no"
run_test "21. Performance Fixes (Listener Retry & Hash)" "perf/test-listener-retry-and-hash.mjs" "yes"
run_test "22. Expert Analysis Fix (Knockout Teams & Cache)" "bracket/test-expert-analysis-fix.mjs" "no"
run_test "23. User Data Protection (ensureUserInStore race)" "store/test-user-data-protection.mjs" "no"
run_test "24. Selection Visualization & Champion Display" "ui/test-selection-and-champion.mjs" "yes"
run_test "25. Sentry Wrapper" "store/test-sentry-wrapper.mjs" "yes"
run_test "26. Stuck-Loading Protection (watchdogs, retry, escape hatch)" "store/test-stuck-loading-protection.mjs" "no"
run_test "27. Score Auto-Init (MatchCard + filled-check regressions)" "ui/test-score-auto-init.mjs" "no"
run_test "28. Match Time Parsing (Israel -> UTC)" "data/test-match-time.mjs" "yes"
run_test "29. Upcoming Matches Selector" "data/test-upcoming-matches.mjs" "yes"
run_test "30. Prediction Alignment (home/away swap)" "bracket/test-prediction-align.mjs" "yes"
run_test "31. Upcoming Matches Integration" "ui/test-upcoming-integration.mjs" "yes"
run_test "32. Form Lock UI (hide new-form when locked)" "ui/test-form-lock-ui.mjs" "no"
run_test "33. Welcome Screen Upcoming (unauth post-kickoff)" "ui/test-welcome-upcoming.mjs" "yes"
run_test "34. Simulator Parity (user sim == real calc)" "bracket/test-simulator-parity.mjs" "yes"
run_test "35. Player Search (Hebrew)" "data/test-player-search-he.mjs" "yes"
run_test "36. Player Display (Hebrew canonical)" "data/test-player-display.mjs" "yes"
run_test "37. Scoring (Hebrew topScorer)" "scoring/test-scoring-he.mjs" "yes"
run_test "38. AI Fill + Leaderboard Display + Simulator Layout" "ui/test-ai-fill-and-display.mjs" "yes"
run_test "39. Scenario Predictor (champion + runner-up auto-fill)" "bracket/test-scenario-predictor.mjs" "yes"
run_test "40. Shared UI Components (Spinner, InlineError, ErrorBanner, EmptyState, Badge)" "ui/test-shared-components.mjs" "jsx"
run_test "41. Focus Trap Hook" "ui/test-focus-trap.mjs" "yes"
run_test "42. Confirm Modal Contract" "ui/test-confirm-modal.mjs" "no"
run_test "43. AI Top Scorer Selection (striker filter + champion anchor)" "data/test-top-scorer-selection.mjs" "yes"
run_test "44. BiDi Scores (static audit)" "ui/test-bidi-scores.mjs" "no"
run_test "45. Match Card Focus Contract" "ui/test-match-card-focus.mjs" "no"
run_test "46. Layout Shell Structure" "ui/test-layout-shell.mjs" "no"
run_test "47. Leaderboard Embedded Mode" "ui/test-leaderboard-embedded.mjs" "no"
run_test "48. Micro-Copy Contract" "ui/test-micro-copy.mjs" "no"
run_test "49. Desktop Design Static Audit" "ui/test-desktop-audit.mjs" "no"
run_test "50. Reopen Form (pending/submitted → draft)" "store/test-reopen-form.mjs" "no"
run_test "51. Tap Targets (WCAG 2.2 AA)" "ui/test-tap-targets.mjs" "no"
run_test "52. Empty States (Profile/Stats/AllForms)" "ui/test-empty-states.mjs" "no"
run_test "53. Auth Copy Consistency" "auth/test-auth-copy.mjs" "no"
run_test "54. Lock Messages Centralised" "ui/test-lock-messages.mjs" "no"
run_test "55. Icon Buttons Aria Labels" "ui/test-icon-buttons-aria.mjs" "no"
run_test "56. Home Desktop Typography" "ui/test-home-desktop-typography.mjs" "no"
run_test "57. Card Focus / Hover Contract" "ui/test-card-focus.mjs" "no"
run_test "58. Profile Consistency (derived champion + shared rank)" "ui/test-profile-consistency.mjs" "no"
run_test "59. Rank Consistency (Leaderboard ↔ Profile parity)" "bracket/test-rank-consistency.mjs" "yes"
run_test "60. Labels Consistency (centralised Hebrew copy)" "ui/test-labels-consistency.mjs" "no"
run_test "61. Form Row Consistency (FormAvatar + FormSummaryLines)" "ui/test-form-row-consistency.mjs" "no"
run_test "62. Layout Fixes (Home+Welcome+UpcomingMatches)" "ui/test-layout-fixes.mjs" "no"
run_test "63. Scoring Differential (independent calc, 5000 random + edge cases)" "scoring/test-scoring-differential.mjs" "yes"
run_test "64. Scoring Verification HTML (regenerate + check 16 visible scenarios)" "scoring/generate-scoring-verification.mjs" "yes"
run_test "65. Form Name Default (auto-populate from nickname + dedup)" "store/test-form-name-default.mjs" "yes"
run_test "66. Summary Stats (per-match prediction breakdown)" "summary/test-summary-stats.mjs" "yes"
run_test "67. Summary Store + Firestore Rules (blog)" "summary/test-summary-store.mjs" "no"
run_test "68. Navigation URL Params (page, n)" "ui/test-navigation-url-params.mjs" "no"
run_test "69. Summary Public Mode + AI Hardening" "summary/test-summary-public-and-ai.mjs" "no"
run_test "70. Summary Review Fixes (deep review regressions)" "summary/test-summary-review-fixes.mjs" "no"
run_test "71. Constants Dedup (static + runtime audit)" "store/test-constants-dedup.mjs" "yes"
run_test "72. Firestore Rules PII Migration (userDirectory + userPrivate)" "store/test-firestore-rules-pii.mjs" "no"
run_test "73. Random Hashed UID Migration (phone PII)" "store/test-uid-hash-migration.mjs" "no"
run_test "74. UX Recommendations (URL state, live errors, focus, accordion, onboarding)" "ui/test-ux-recommendations.mjs" "no"
run_test "75. Leaderboard Search (form/user/champion/top-scorer filter)" "ui/test-leaderboard-search.mjs" "no"
run_test "76. Offline Mode Tabs (guest navigation + LoginPrompt + FormsHub)" "ui/test-offline-tabs.mjs" "no"
run_test "77. Guest Home Shell (welcome screen inside AppShell + responsive)" "ui/test-guest-home-shell.mjs" "no"
run_test "78. Pending Approval Tab (filter logic, badge, sort, action buttons)" "ui/test-pending-approval-tab.mjs" "no"
run_test "79. Admin Users Edit (display + scoped identity edit)" "ui/test-admin-users-edit.mjs" "no"
run_test "80. Transfer Form Ownership (admin move A→B)" "store/test-transfer-form.mjs" "yes"
run_test "81. Leaderboard Scroll (no auto-scroll + back-to-top)" "ui/test-leaderboard-scroll.mjs" "no"

echo ""
echo "==========================================="
echo "  TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed"
echo "==========================================="

# Bash exits clamp to 0..255 — a sufficiently large $TOTAL_FAIL would wrap
# back to 0 and the suite would report green to CI. Always exit 1 on any
# failure, 0 on full pass.
if [ "$TOTAL_FAIL" -gt 0 ]; then exit 1; fi
exit 0
