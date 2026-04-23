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

echo ""
echo "==========================================="
echo "  TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed"
echo "==========================================="

exit $TOTAL_FAIL
