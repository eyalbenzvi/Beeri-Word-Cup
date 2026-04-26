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

run_test() {
  local name="$1"
  local file="$2"
  local needs_loader="$3"

  echo -n "$name: "
  if [ "$needs_loader" = "jsx" ]; then
    result=$(node --loader "$JSX_LOADER" "$DIR/$file" 2>&1 | grep -E "passed|failed" | tail -1)
  elif [ "$needs_loader" = "yes" ]; then
    result=$(node --loader "$LOADER" "$DIR/$file" 2>&1 | grep -E "passed|failed" | tail -1)
  else
    result=$(node "$DIR/$file" 2>&1 | grep -E "passed|failed" | tail -1)
  fi

  echo "$result"

  p=$(echo "$result" | grep -oP '\d+ passed' | grep -oP '\d+')
  f=$(echo "$result" | grep -oP '\d+ failed' | grep -oP '\d+')
  TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0}))
}

run_test "1. Scoring Logic" "test-scoring.mjs" "no"
run_test "2. Bracket & Advancement" "test-bracket.mjs" "yes"
run_test "3. Third Place Table" "test-thirdplace.mjs" "yes"
run_test "4. FIFA Schedule" "test-schedule.mjs" "yes"
run_test "5. Edge Cases" "test-edge-cases.mjs" "yes"
run_test "6. Full Simulation" "test-full-simulation.mjs" "yes"
run_test "7. Leaderboard E2E" "test-leaderboard-e2e.mjs" "yes"
run_test "8. Store Logic" "test-store-logic.mjs" "no"
run_test "9. Load & User Mgmt" "test-load-and-users.mjs" "yes"
run_test "10. Functions & API Contract" "test-functions-contract.mjs" "no"
run_test "11. Comprehensive Bug Detection" "test-comprehensive-bugs.mjs" "no"
run_test "12. Profile Features" "test-profile-features.mjs" "no"
run_test "13. External Cross-Validation (300 trials)" "test-external-crossval.mjs" "yes"
run_test "14. Excel Cross-Validation (FIFA bracket)" "test-excel-crossval.mjs" "yes"
run_test "15. Python Cross-Validation (100 trials)" "test-python-crossval.mjs" "yes"
run_test "16. Phone Auth & OTP Security" "test-phone-auth.mjs" "no"
run_test "17. Bracket Cache Fix" "test-bracket-cache.mjs" "yes"
run_test "18. Batch Limit Fix" "test-batch-limit.mjs" "no"
run_test "19. Performance Fixes (Comprehensive)" "test-performance-fixes.mjs" "yes"
run_test "20. Audit Fix Regression Tests" "test-audit-fixes.mjs" "no"
run_test "21. Performance Fixes V2 (Listener/Auth/Hash/Lazy)" "test-performance-fixes-v2.mjs" "yes"
run_test "22. Expert Analysis Fix (Knockout Teams & Cache)" "test-expert-analysis-fix.mjs" "no"
run_test "23. User Data Protection (ensureUserInStore race)" "test-user-data-protection.mjs" "no"
run_test "24. Selection Visualization & Champion Display" "test-selection-and-champion.mjs" "yes"
run_test "25. Sentry Wrapper" "test-sentry-wrapper.mjs" "no"
run_test "26. Stuck-Loading Protection (watchdogs, retry, escape hatch)" "test-stuck-loading-protection.mjs" "no"
run_test "27. Score Auto-Init (MatchCard + filled-check regressions)" "test-score-auto-init.mjs" "no"
run_test "28. Match Time Parsing (Israel -> UTC)" "test-match-time.mjs" "yes"
run_test "29. Upcoming Matches Selector" "test-upcoming-matches.mjs" "yes"
run_test "30. Prediction Alignment (home/away swap)" "test-prediction-align.mjs" "no"
run_test "31. Upcoming Matches Integration" "test-upcoming-integration.mjs" "yes"
run_test "32. Form Lock UI (hide new-form when locked)" "test-form-lock-ui.mjs" "no"
run_test "33. Welcome Screen Upcoming (unauth post-kickoff)" "test-welcome-upcoming.mjs" "yes"
run_test "34. Simulator Parity (user sim == real calc)" "test-simulator-parity.mjs" "yes"
run_test "35. Player Search (Hebrew)" "test-player-search-he.mjs" "yes"
run_test "36. Player Display (Hebrew canonical)" "test-player-display.mjs" "yes"
run_test "37. Scoring (Hebrew topScorer)" "test-scoring-he.mjs" "yes"
run_test "38. AI Fill + Leaderboard Display + Simulator Layout" "test-ai-fill-and-display.mjs" "yes"
run_test "39. Scenario Predictor (champion + runner-up auto-fill)" "test-scenario-predictor.mjs" "yes"
run_test "40. Shared UI Components (Spinner, InlineError, ErrorBanner, EmptyState, Badge)" "test-shared-components.mjs" "jsx"
run_test "41. Focus Trap Hook" "test-focus-trap.mjs" "no"
run_test "42. Confirm Modal Contract" "test-confirm-modal.mjs" "no"
run_test "43. AI Top Scorer Selection (striker filter + champion anchor)" "test-top-scorer-selection.mjs" "yes"
run_test "44. BiDi Scores (static audit)" "test-bidi-scores.mjs" "no"
run_test "45. Match Card Focus Contract" "test-match-card-focus.mjs" "no"
run_test "46. Layout Shell Structure" "test-layout-shell.mjs" "no"
run_test "47. Leaderboard Embedded Mode" "test-leaderboard-embedded.mjs" "no"
run_test "48. Micro-Copy Contract" "test-micro-copy.mjs" "no"
run_test "49. Desktop Design Static Audit" "test-desktop-audit.mjs" "no"
run_test "50. Reopen Form (pending/submitted → draft)" "test-reopen-form.mjs" "no"
run_test "51. Tap Targets (WCAG 2.2 AA)" "test-tap-targets.mjs" "no"
run_test "52. Empty States (Profile/Stats/AllForms)" "test-empty-states.mjs" "no"
run_test "53. Auth Copy Consistency" "test-auth-copy.mjs" "no"
run_test "54. Lock Messages Centralised" "test-lock-messages.mjs" "no"
run_test "55. Icon Buttons Aria Labels" "test-icon-buttons-aria.mjs" "no"
run_test "56. Home Desktop Typography" "test-home-desktop-typography.mjs" "no"
run_test "57. Card Focus / Hover Contract" "test-card-focus.mjs" "no"
run_test "58. Profile Consistency (derived champion + shared rank)" "test-profile-consistency.mjs" "no"
run_test "59. Rank Consistency (Leaderboard ↔ Profile parity)" "test-rank-consistency.mjs" "yes"
run_test "60. Labels Consistency (centralised Hebrew copy)" "test-labels-consistency.mjs" "no"
run_test "61. Form Row Consistency (FormAvatar + FormSummaryLines)" "test-form-row-consistency.mjs" "no"
run_test "62. Layout Fixes (Home+Welcome+UpcomingMatches)" "test-layout-fixes.mjs" "no"
run_test "63. Scoring Differential (independent calc, 5000 random + edge cases)" "test-scoring-differential.mjs" "yes"
run_test "64. Scoring Verification HTML (regenerate + check 16 visible scenarios)" "generate-scoring-verification.mjs" "yes"
run_test "65. Form Name Default (auto-populate from nickname + dedup)" "test-form-name-default.mjs" "yes"
run_test "66. Summary Stats (per-match prediction breakdown)" "test-summary-stats.mjs" "yes"
run_test "67. Summary Store + Firestore Rules (blog)" "test-summary-store.mjs" "no"
run_test "68. Navigation URL Params (page, n)" "test-navigation-url-params.mjs" "no"
run_test "69. Summary Public Mode + AI Hardening" "test-summary-public-and-ai.mjs" "no"
run_test "70. Summary Review Fixes (deep review regressions)" "test-summary-review-fixes.mjs" "no"
run_test "71. Constants Dedup (static + runtime audit)" "test-constants-dedup.mjs" "yes"

echo ""
echo "==========================================="
echo "  TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed"
echo "==========================================="

exit $TOTAL_FAIL
