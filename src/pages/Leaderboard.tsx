import { useState, useMemo, useEffect } from "react";
import { ArrowRight, TrendingUp, TrendingDown, Search, X } from "lucide-react";
import EmptyState from "../components/EmptyState";
import {
  useCurrentUser,
  useMatchResults,
  useAllPredictions,
  useUserDirectory,
  useActualBonuses,
  useSettings,
} from "../hooks/useStore";
import { useLeaderboardComputed } from "../hooks/useLeaderboardComputed";
import { useNavigation } from "../hooks/useNavigation";
import { groupMatches, knockoutMatches, STAGES } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import MatchCard from "../components/MatchCard";
import Score from "../components/Score";
import PageHeader from "../components/PageHeader";
import FormAvatar from "../components/FormAvatar";
import FormSummaryLines from "../components/FormSummaryLines";
import LoginPrompt from "../components/LoginPrompt";
import { getPlayerDisplayName, normalizeSearch, resolvePlayerList } from "../utils/playerSearch";
import { preferredScrollBehavior } from "../utils/helpers";
import { LABELS } from "../constants/messages";
import BestCasePanel from "../components/BestCasePanel";
import AchievementBadges from "../components/AchievementBadges";
import RankTrendSparkline from "../components/RankTrendSparkline";
import FormComparison from "../components/FormComparison";
import { recordRanks } from "../utils/rankHistory";
import BackToTopButton from "../components/BackToTopButton";
import ScrollToBottomButton from "../components/ScrollToBottomButton";

const allMatchesMap = Object.fromEntries(
  [...groupMatches, ...knockoutMatches].map((m) => [m.id, m]),
);

// Pagination chunk for the ranked list — load this many initially and add
// the same again each time the user clicks "show more".
const PAGE_SIZE = 20;

// Scroll grace period: enough for `content-visibility: auto` cards to
// finalise their intrinsic-size paint so getBoundingClientRect lands on the
// actual element. Below ~120ms the scroll lands a few hundred pixels off on
// long lists.
const SCROLL_DELAY_MS = 150;

// Cap on the search query length. Matches AllForms' filter input so a user
// who copies a string between the two pages doesn't get a different
// truncation. Form names themselves are limited far below this elsewhere.
const SEARCH_MAX_LEN = 50;

// Compact stage labels for the "נקודות עליה" badges. Intentionally shorter
// than STAGES (e.g. "שמינית" not "שמינית גמר") so the chips fit on a phone
// row. Keep the order = KNOCKOUT_STAGE_ORDER minus 3RD (3RD has no
// advancing-points chip — third place is a terminal stage).
const ADVANCING_POINTS_LABELS = [
  ["R32", "שלב ה-32"],
  ["R16", "שמינית"],
  ["QF", "רבע"],
  ["SF", "חצי"],
  ["F", "גמר"],
];

export default function Leaderboard({
  embedded = false,
  forceUnlockView = false,
}) {
  const { user } = useCurrentUser();
  const results = useMatchResults();
  const allPredictions = useAllPredictions();
  const users = useUserDirectory();
  const actualBonuses = useActualBonuses();
  const settings = useSettings();
  const locked = settings.predictionsLocked;
  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );
  const { params, setParamsPatch } = useNavigation();
  const [selectedForm, setSelectedForm] = useState<string | null>(
    embedded ? null : params?.form || null,
  );
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  // Exploration controls (#7). Sorting re-orders the visible list by a chosen
  // metric while every row keeps its OFFICIAL rank badge — so you can ask
  // "who has the most exact scores?" without losing the standings context.
  // "mineOnly" narrows to the signed-in user's own forms.
  const [sortBy, setSortBy] = useState<"rank" | "exact" | "outcome">("rank");
  const [mineOnly, setMineOnly] = useState(false);

  // Deep-link support: arriving with ?form=<id> (e.g. tapping a form name in
  // the Stats voter lists) opens that form's detail view. Skipped in the
  // embedded admin preview so an unrelated URL param can't hijack it.
  useEffect(() => {
    if (embedded) return;
    if (params?.form) {
      setSelectedForm(params.form);
      setComparing(false);
    }
  }, [params?.form, embedded]);

  // Head-to-head comparison (#3) toggle for the open form detail.
  const [comparing, setComparing] = useState(false);

  // Closing the detail also clears the URL param, so Back/refresh return to
  // the ranked list rather than re-opening the form.
  const closeForm = () => {
    setSelectedForm(null);
    setComparing(false);
    if (!embedded && params?.form) setParamsPatch({ form: null });
  };

  const { formBracketMap, scoredForms, leaderboard, rankedLeaderboard, actualBracket } =
    useLeaderboardComputed(results, allPredictions, users, actualBonuses);

  // Find every form belonging to the current user, sorted by rank ascending
  // (best first). On the locked tournament view this powers the "your forms:
  // #5, #23, #87" jump list. The page itself always opens at the top —
  // jumping to your own row is a deliberate tap, never an auto-scroll.
  const myForms = useMemo(() => {
    if (!user?.id) return [];
    return rankedLeaderboard.filter((e) => e.userId === user.id);
  }, [rankedLeaderboard, user?.id]);

  // Accumulate a local rank time-series for the user's own forms (#6). The
  // util dedupes (records only on movement, or once/day for a stable rank), so
  // this is safe to fire on every leaderboard recompute. Skipped in embedded
  // admin preview.
  useEffect(() => {
    if (embedded || myForms.length === 0) return;
    recordRanks(myForms.map((f) => ({ formId: f.formId, rank: f.rank })));
  }, [myForms, embedded]);

  // Precomputed search haystack per form — built once whenever the
  // underlying data (users / brackets / predictions / lock state) changes,
  // and re-used for every keystroke. Matches form name, owner display
  // name, predicted champion's team name and predicted top scorer's
  // resolved Hebrew name. `normalizeSearch` lower-cases and strips niqqud
  // so "ארגנטינה" matches both vowelled and unvowelled queries.
  //
  // Privacy: champion + top-scorer are only included when the row is
  // viewable to the current user — otherwise the search would leak
  // private predictions before lock.
  //
  // Two-stage memo (data → haystack, query → filter): keeps every
  // keystroke at O(N) `.includes` instead of re-resolving team names and
  // re-running niqqud-stripping per row per character.
  const searchHaystacks = useMemo(() => {
    const out: Record<string, string> = {};
    for (const entry of rankedLeaderboard) {
      const owner = users[entry.userId];
      const ownerName = owner?.firstName
        ? owner.lastName
          ? `${owner.firstName} ${owner.lastName}`
          : owner.firstName
        : owner?.displayName || "";
      const canView = locked || forceUnlockView || entry.userId === user?.id;
      const championCode = formBracketMap[entry.formId]?.champion;
      const championName =
        canView && championCode ? getTeamByCode(championCode)?.name || "" : "";
      const topScorerRaw = canView ? allPredictions[entry.formId]?.topScorer : null;
      const topScorerName = topScorerRaw
        ? getPlayerDisplayName(topScorerRaw, playerList)
        : "";
      out[entry.formId] = [entry.formName, ownerName, championName, topScorerName]
        .filter(Boolean)
        .map(normalizeSearch)
        .join(" ");
    }
    return out;
  }, [
    rankedLeaderboard,
    users,
    formBracketMap,
    allPredictions,
    playerList,
    locked,
    forceUnlockView,
    user?.id,
  ]);

  const isSearching = searchQuery.trim().length > 0;

  const filteredLeaderboard = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    if (!q) return rankedLeaderboard;
    return rankedLeaderboard.filter((entry) => {
      const haystack = searchHaystacks[entry.formId] || "";
      return haystack.includes(q);
    });
  }, [searchQuery, rankedLeaderboard, searchHaystacks]);

  // The list actually rendered: search filter → "mine only" → chosen sort.
  // Sorting clones the array (never mutate the memoized source) and always
  // tie-breaks by official rank for a stable, deterministic order.
  const displayedLeaderboard = useMemo(() => {
    let list = filteredLeaderboard;
    if (mineOnly && user?.id) list = list.filter((e) => e.userId === user.id);
    if (sortBy === "rank") return list;
    const metric = sortBy === "exact" ? "exactScoreCount" : "outcomeCount";
    return [...list].sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.rank - b.rank);
  }, [filteredLeaderboard, mineOnly, sortBy, user?.id]);

  // Smooth jump to a leaderboard row, expanding the page-size if the row
  // would otherwise be clipped behind "show more". Triggered ONLY by the
  // user-controlled "הטפסים שלך" jump chips — the page never scrolls on
  // its own (an entry auto-scroll used to live here and was removed:
  // landing mid-table disoriented users more than it helped).
  const jumpToForm = (formId: string) => {
    // Index within the CURRENTLY DISPLAYED list (search/sort/filter aware) so
    // the page-size grows enough to reveal the targeted row in its real spot.
    const idx = displayedLeaderboard.findIndex((e) => e.formId === formId);
    if (idx < 0) return;
    if (idx + 1 > showCount) {
      const grow = Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE;
      setShowCount(grow);
    }
    setTimeout(() => {
      const el = document.getElementById(`lb-form-${formId}`);
      el?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
    }, SCROLL_DELAY_MS);
  };

  // One-tap path to last place: reveal the whole (possibly filtered) list —
  // bypassing the "show more" pagination that otherwise buries the bottom
  // behind many taps — then smooth-scroll the final row into view. Like
  // jumpToForm, this only ever fires from a user gesture (the floating
  // ScrollToBottomButton), never from an effect.
  const jumpToBottom = () => {
    if (displayedLeaderboard.length === 0) return;
    setShowCount(displayedLeaderboard.length);
    setTimeout(() => {
      // Scroll to the last *rendered* row by querying the DOM rather than a
      // formId captured at click time: a live Firestore update could reorder
      // or drop rows during the render delay, and querying keeps the jump
      // landing on whatever the real last row is.
      const rows = document.querySelectorAll('[id^="lb-form-"]');
      const last = rows[rows.length - 1];
      last?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
    }, SCROLL_DELAY_MS);
  };

  // When a form is opened from the leaderboard, jump to the top of the page
  // so the user starts reading from the form header instead of inheriting the
  // scroll offset of the row they tapped. Skipped in embedded admin preview.
  useEffect(() => {
    if (embedded || !selectedForm) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedForm, embedded]);

  // Rank delta: compare current rank per formId with the rank we saw last
  // visit. Stored in localStorage under "beeri:prevRanks". Deltas show for 3s
  // before we overwrite the snapshot.
  const [prevRanks, setPrevRanks] = useState({});
  useEffect(() => {
    if (embedded) return;
    try {
      const raw = localStorage.getItem("beeri:prevRanks");
      if (raw) setPrevRanks(JSON.parse(raw));
    } catch { /* Private mode / quota — ignore */ }
  }, [embedded]);
  useEffect(() => {
    if (embedded || rankedLeaderboard.length === 0) return;
    const t = setTimeout(() => {
      try {
        const snap = {};
        for (const e of rankedLeaderboard) snap[e.formId] = e.rank;
        localStorage.setItem("beeri:prevRanks", JSON.stringify(snap));
      } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [rankedLeaderboard, embedded]);

  const renderFormDetail = () => {
    if (!selectedForm) return null;

    // Don't show other users' form details before predictions are locked
    const formOwner = allPredictions[selectedForm]?.userId;
    if (!settings.predictionsLocked && formOwner !== user?.id) {
      return null;
    }

    const predData = allPredictions[selectedForm] || {};
    const bracketData = formBracketMap[selectedForm];
    const predBracket = bracketData?.predBracket || {};
    const derivedChampion = bracketData?.champion || null;
    const scored = scoredForms.find((e) => e.formId === selectedForm);
    const score = scored || {
      totalPoints: 0,
      exactScoreCount: 0,
      outcomeCount: 0,
      correctChampion: false,
      correctTopScorer: false,
      advancingPoints: {},
      matchScores: {},
    };
    const playedMatches = Object.keys(results);

    const matchesByStage = {};
    for (const matchId of playedMatches) {
      const match = allMatchesMap[matchId];
      const result = results[matchId];
      const stage = result.stage || match?.stage || "group";
      if (!matchesByStage[stage]) matchesByStage[stage] = [];
      matchesByStage[stage].push({ matchId, match, result });
    }

    return (
      <div className="mt-4">
        <button
          onClick={closeForm}
          className="text-sm text-secondary mb-3 flex items-center gap-1 bg-transparent border-none cursor-pointer font-extrabold p-0 hover:text-secondary-dark"
        >
          <ArrowRight size={16} aria-hidden="true" />
          חזרה לטבלת הדירוג
        </button>

        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-xl font-extrabold text-ink">
            {predData.formName || "טופס ללא שם"}
          </h2>
          {settings.predictionsLocked && rankedLeaderboard.length > 1 && (
            <button
              onClick={() => setComparing((v) => !v)}
              aria-pressed={comparing}
              className={`chip-duo shrink-0 ${comparing ? "active-blue" : ""}`}
            >
              ⚔️ השווה
            </button>
          )}
        </div>

        {comparing && (
          <FormComparison formAId={selectedForm} onClose={() => setComparing(false)} />
        )}

        <div className="card-duo mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-primary tabular-nums">
              <bdi>{score.totalPoints}</bdi>
            </div>
            <div className="text-ink-muted font-bold">סה״כ</div>
          </div>
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-primary tabular-nums">
              <bdi>{score.exactScoreCount}</bdi>
            </div>
            <div className="text-ink-muted font-bold">{LABELS.exactCount}</div>
          </div>
          <div className="bg-bg-soft rounded-xl p-3">
            <div className="text-2xl font-extrabold text-secondary tabular-nums">
              <bdi>{score.outcomeCount}</bdi>
            </div>
            <div className="text-ink-muted font-bold">{LABELS.outcomeCount}</div>
          </div>
        </div>

        <RankTrendSparkline formId={selectedForm} />

        <AchievementBadges scored={scored} />

        {Object.values(score.advancingPoints).some((v) => v > 0) && (
          <div className="card-duo mb-4 text-sm">
            <div className="text-sm font-extrabold text-ink mb-2">
              נקודות עליה:
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {ADVANCING_POINTS_LABELS.map(([round, label]) => {
                const pts = score.advancingPoints[round] || 0;
                if (!pts) return null;
                return (
                  <span
                    key={round}
                    className="bg-primary text-white font-extrabold px-2.5 py-1 rounded-full"
                  >
                    {label}: <bdi>+{pts}</bdi>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="card-duo mb-4 text-sm">
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-ink-muted font-bold">{LABELS.guessChampion}:</span>
            <span className="font-extrabold text-ink">
              {derivedChampion
                ? getTeamByCode(derivedChampion)?.name || "טרם נקבע"
                : "אין"}
              {score.correctChampion ? " ✅" : ""}
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-ink-muted font-bold">{LABELS.guessTopScorer}:</span>
            <span className="font-extrabold text-ink">
              {predData.topScorer ? getPlayerDisplayName(predData.topScorer, playerList) : "אין"}
              {score.correctTopScorer ? " ✅" : ""}
            </span>
          </div>
          {predData.status === "submitted" || predData.status === "approved" ? (
            <BestCasePanel formId={selectedForm} />
          ) : null}
        </div>

        {Object.entries(matchesByStage).map(([stage, matchesAny]) => (
          <div key={stage} className="mb-4">
            <h3 className="text-sm font-extrabold text-ink mb-2">
              {STAGES[stage] || stage}
            </h3>
            {(matchesAny as any[]).map(({ matchId, match, result }) => {
              const prediction = predData.matches?.[matchId];
              const predTeams = predBracket[matchId] || null;
              const actTeams = actualBracket[matchId] || null;
              const pts = score.matchScores?.[matchId] || {
                points: 0,
                outcomePoints: 0,
                exactPoints: 0,
                breakdown: "",
                wrongMatchup: false,
              };
              const derivedMatch =
                match?.stage !== "group" && actTeams
                  ? {
                      ...match,
                      homeTeam: actTeams.home,
                      awayTeam: actTeams.away,
                    }
                  : match || {
                      homeTeam: result.homeTeam,
                      awayTeam: result.awayTeam,
                    };
              const predMatchup =
                stage !== "group" && predTeams?.home && predTeams?.away
                  ? {
                      home: getTeamByCode(predTeams.home),
                      away: getTeamByCode(predTeams.away),
                    }
                  : null;
              return (
                <div key={matchId}>
                  <MatchCard
                    match={derivedMatch}
                    prediction={prediction}
                    actualResult={result}
                    showPoints
                    points={pts}
                  />
                  {predMatchup && (
                    <div
                      className={`text-xs px-3 py-1.5 -mt-1 mb-2 rounded-b-xl font-bold ${
                        pts.wrongMatchup
                          ? "text-danger"
                          : "text-secondary"
                      }`}
                      style={{ background: pts.wrongMatchup ? "var(--color-danger-soft)" : "var(--color-secondary-soft)" }}
                    >
                      ניחש: {predMatchup.home?.name || "טרם נקבע"} נגד{" "}
                      {predMatchup.away?.name || "טרם נקבע"}
                      {prediction
                        ? <>{" "}<Score home={prediction.homeScore} away={prediction.awayScore} separator="-" wrap="parens" /></>
                        : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {playedMatches.length === 0 && (
          <p className="text-center text-ink-muted font-medium py-8">
            עדיין לא שוחקו משחקים
          </p>
        )}
      </div>
    );
  };

  if (!embedded && !forceUnlockView && !locked) {
    return (
      <>
        <div className="text-center py-16 card-duo-lg max-w-md mx-auto">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-extrabold text-ink mb-2">טבלת דירוג</h2>
          <p className="text-sm text-ink-muted font-medium">הדירוג יתגלה כשהמשחקים יתחילו.</p>
        </div>
        {!user && (
          <LoginPrompt
            title="עדיין לא הצטרפת?"
            subtitle="התחבר עכשיו וצור טפסים — הדירוג ייפתח בשריקת הפתיחה"
          />
        )}
      </>
    );
  }

  // Guest visitors see the same ranked board (post-lock the data is fetched
  // by the public-mode endpoint), but we hide own-form jump-buttons (none
  // exist for a logged-out user) and surface an inline LoginPrompt at the
  // top so they can sign in to track their own forms.
  const isGuest = !user;

  return (
    <div>
      {!embedded && <PageHeader title="טבלת דירוג" />}
      {embedded && (
        <p className="text-sm font-extrabold text-ink mb-3">
          תצוגה מקדימה (מנהל)
        </p>
      )}
      {!embedded && isGuest && (
        <LoginPrompt
          variant="banner"
          title="התחבר כדי לעקוב אחרי הטפסים שלך"
          subtitle="הדירוג גלוי לכולם. כדי להגיש טופס וליהנות מהקפיצה הישירה למיקום שלך — צריך חשבון."
        />
      )}

      {selectedForm ? (
        renderFormDetail()
      ) : (
        <>
          {/* Shown from a single form up: with no auto-scroll the chip is
              the only fast path to your own row, so a one-form user needs
              it just as much as a ten-form user. */}
          {!embedded && myForms.length >= 1 && (
            <div
              className="card-duo mb-3"
              style={{ background: "var(--color-primary-soft)", borderColor: "var(--color-primary)" }}
            >
              <div className="text-xs font-extrabold text-ink mb-2">
                {myForms.length === 1 ? "הטופס שלך:" : "הטפסים שלך:"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {myForms.map((f) => (
                  <button
                    key={f.formId}
                    onClick={() => jumpToForm(f.formId)}
                    className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-white border-2 border-primary text-primary-dark cursor-pointer hover:bg-primary-soft"
                  >
                    #{f.rank} · {f.formName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!embedded && rankedLeaderboard.length > 0 && (
            <div className="card-duo mb-3">
              <label htmlFor="lb-search" className="block text-xs font-extrabold text-ink-muted mb-1.5">
                חיפוש בטבלת הדירוג
              </label>
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-y-1/2 right-3 text-ink-light pointer-events-none"
                />
                <input
                  id="lb-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    // Reset pagination so the user always sees the first
                    // chunk of matches for their new query, regardless of
                    // how far they had scrolled the unfiltered list.
                    setShowCount(PAGE_SIZE);
                  }}
                  placeholder={`חפש לפי שם טופס, משתמש, ${LABELS.champion} או ${LABELS.topScorer}...`}
                  className="input-duo w-full"
                  // 2.25rem = the .input-duo's 1rem horizontal padding plus
                  // ~1.25rem to clear the 16px Search icon parked at right-3.
                  // Inline style because the .input-duo class uses the
                  // `padding` shorthand and a Tailwind `ps-9` modifier
                  // wouldn't override a single side cleanly.
                  style={{ paddingInlineStart: "2.25rem" }}
                  maxLength={SEARCH_MAX_LEN}
                  aria-label="חיפוש בטבלת הדירוג"
                />
                {isSearching && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setShowCount(PAGE_SIZE);
                    }}
                    aria-label="נקה חיפוש"
                    // `tap-44` enforces the 44×44 minimum touch target on
                    // coarse pointers (brand book accessibility rule); the
                    // visible icon stays small thanks to the centered flex.
                    className="tap-44 absolute top-1/2 -translate-y-1/2 left-1 text-ink-muted hover:text-ink bg-transparent border-none cursor-pointer rounded-full inline-flex items-center justify-center"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {isSearching && (
                <p
                  className="text-xs text-ink-muted font-bold mt-2"
                  aria-live="polite"
                >
                  {filteredLeaderboard.length === 0
                    ? "לא נמצאו טפסים תואמים"
                    : `מציג ${filteredLeaderboard.length} מתוך ${rankedLeaderboard.length} טפסים`}
                </p>
              )}
            </div>
          )}

          {!embedded && rankedLeaderboard.length > 1 && (
            <div className="card-duo mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-ink-muted">מיון:</span>
              {[
                { id: "rank", label: "דירוג" },
                { id: "exact", label: LABELS.exactCount },
                { id: "outcome", label: LABELS.outcomeCount },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setSortBy(opt.id as "rank" | "exact" | "outcome");
                    setShowCount(PAGE_SIZE);
                  }}
                  aria-pressed={sortBy === opt.id}
                  className={`chip-duo ${sortBy === opt.id ? "active" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
              {myForms.length > 0 && (
                <button
                  onClick={() => {
                    setMineOnly((v) => !v);
                    setShowCount(PAGE_SIZE);
                  }}
                  aria-pressed={mineOnly}
                  className={`chip-duo ${mineOnly ? "active-blue" : ""}`}
                  style={{ marginInlineStart: "auto" }}
                >
                  שלי בלבד
                </button>
              )}
            </div>
          )}

          <div className="space-y-2">
            {displayedLeaderboard.slice(0, showCount).map((entry) => {
              const currentRank = entry.rank;
              const isTop3 = currentRank <= 3;
              const canView =
                forceUnlockView || locked || entry.userId === user?.id;
              const championCode = formBracketMap[entry.formId]?.champion;
              const championName = championCode
                ? getTeamByCode(championCode)?.name
                : null;
              const topScorerRaw = allPredictions[entry.formId]?.topScorer;
              const topScorerDisplay = topScorerRaw
                ? getPlayerDisplayName(topScorerRaw, playerList)
                : null;
              const borderColor =
                currentRank === 1
                  ? "border-gold"
                  : currentRank === 2
                    ? "border-silver"
                    : currentRank === 3
                      ? "border-bronze"
                      : "border-border";
              return (
                <button
                  key={entry.formId}
                  id={`lb-form-${entry.formId}`}
                  onClick={() => {
                    if (canView) setSelectedForm(entry.formId);
                  }}
                  aria-disabled={!canView}
                  tabIndex={canView ? 0 : -1}
                  title={canView ? undefined : "הניחושים יוצגו לאחר נעילת הטורניר"}
                  // `content-visibility: auto` lets the browser skip layout
                  // + paint for off-screen entries, providing free
                  // virtualization without a JS library. `contain-intrinsic-
                  // size` reserves a placeholder height so scroll position
                  // stays stable as cards enter the viewport. With 200+ forms
                  // this avoids layout-thrash on initial render.
                  style={{ contentVisibility: "auto", containIntrinsicSize: "0 88px" }}
                  className={`w-full bg-white rounded-2xl p-4 border-2 flex items-center gap-3 text-right ${borderColor} ${
                    entry.userId === user?.id ? "ring-2 ring-primary" : ""
                  } ${
                    canView
                      ? "cursor-pointer card-duo-hover"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-extrabold tabular-nums text-center inline-block flex-shrink-0 ${
                      currentRank === 1
                        ? "podium-gold text-white"
                        : currentRank === 2
                          ? "podium-silver text-white"
                          : currentRank === 3
                            ? "podium-bronze text-white"
                            : "bg-bg-soft text-ink-muted"
                    }`}
                  >
                    {currentRank === 1
                      ? "🥇"
                      : currentRank === 2
                        ? "🥈"
                        : currentRank === 3
                          ? "🥉"
                          : currentRank}
                  </span>

                  <FormAvatar form={{ formName: entry.formName, status: "submitted" }} size="md" />

                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm truncate text-ink">
                      {entry.formName}
                    </div>
                    {(() => {
                      const u = users[entry.userId];
                      const name = u?.firstName
                        ? (u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName)
                        : u?.displayName || null;
                      return name ? (
                        <div className="text-xs text-ink-muted font-medium truncate">{name}</div>
                      ) : null;
                    })()}
                    {canView && (
                      <FormSummaryLines
                        championName={championName}
                        topScorerName={topScorerDisplay}
                      />
                    )}
                    <div className="text-xs text-ink-muted tabular-nums font-bold">
                      <bdi>{entry.exactScoreCount}</bdi> {LABELS.exactCount} • <bdi>{entry.outcomeCount}</bdi>{" "}
                      {LABELS.outcomeCount}
                    </div>
                  </div>

                  <div className="text-left min-w-[50px] flex flex-col items-start gap-0.5">
                    {!embedded && prevRanks[entry.formId] != null && prevRanks[entry.formId] !== currentRank && (() => {
                      const delta = prevRanks[entry.formId] - currentRank;
                      if (delta === 0) return null;
                      const up = delta > 0;
                      return (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums animate-pop-in ${
                            up ? "bg-primary/10 text-primary-dark" : "bg-danger/10 text-danger"
                          }`}
                          aria-label={up ? `עלית ${delta} מקומות` : `ירדת ${-delta} מקומות`}
                        >
                          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {Math.abs(delta)}
                        </span>
                      );
                    })()}
                    <div
                      className={`text-2xl font-extrabold tabular-nums ${isTop3 ? "text-primary" : "text-ink"}`}
                    >
                      <bdi>{entry.totalPoints}</bdi>
                    </div>
                    <div className="text-xs text-ink-muted font-bold">{LABELS.pointsShort}</div>
                  </div>
                </button>
              );
            })}

            {showCount < displayedLeaderboard.length && (
              <div className="mt-2 flex flex-col gap-2">
                <button onClick={() => setShowCount(s => s + PAGE_SIZE)} className="btn-duo btn-duo-ghost btn-duo-cta">
                  הצג {Math.min(PAGE_SIZE, displayedLeaderboard.length - showCount)} נוספים (נותרו {displayedLeaderboard.length - showCount})
                </button>
                {/* Load the entire remaining list in one tap — the
                    convenient path for browsing the tail of the table
                    instead of clicking "show more" repeatedly. */}
                <button
                  onClick={() => setShowCount(displayedLeaderboard.length)}
                  className="btn-duo btn-duo-ghost text-sm"
                >
                  הצג את כולם ({displayedLeaderboard.length})
                </button>
              </div>
            )}

            {leaderboard.length === 0 && (
              <EmptyState
                icon="🏟️"
                title="אין ניחושים עדיין"
                description="היה הראשון להגיש טופס"
              />
            )}

            {leaderboard.length > 0 && displayedLeaderboard.length === 0 && (
              <EmptyState
                icon="🔍"
                title={mineOnly && !isSearching ? "אין לך טפסים בדירוג" : "לא נמצאו טפסים תואמים"}
                description={
                  mineOnly && !isSearching
                    ? "בטל את הסינון \"שלי בלבד\" כדי לראות את כל הטפסים"
                    : `נסה לחפש לפי שם טופס, משתמש, ${LABELS.champion} או ${LABELS.topScorer}`
                }
              />
            )}
          </div>
        </>
      )}

      {/* Floating jump-to-bottom — only on the ranked-list view (not the
          form detail) and only when the list is long enough to be paginated,
          so there's a real "bottom" worth a one-tap jump. Lives in the same
          corner as BackToTopButton but shows at the opposite scroll
          position, so the two are never visible together. */}
      {!embedded && !selectedForm && displayedLeaderboard.length > PAGE_SIZE && (
        <ScrollToBottomButton onClick={jumpToBottom} />
      )}

      {/* Floating back-to-top — covers both the long ranked list and the
          long form-detail view. Skipped in embedded admin preview, where
          the leaderboard renders inside another page's scroll context. */}
      {!embedded && <BackToTopButton />}
    </div>
  );
}
