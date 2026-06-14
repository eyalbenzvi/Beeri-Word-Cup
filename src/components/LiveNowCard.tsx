// LiveNow hero — the top-of-home card during the tournament. Replaces the
// old static MatchdayHero with a state machine:
//
//   live matches in window  -> loud card: real-time score + per-form verdict
//   matches later today     -> quiet strip: countdown to next kickoff
//   rest day                -> quiet strip: next match (date + time)
//   nothing schedulable     -> renders nothing (UpcomingMatches owns empty)
//
// Truth rules (review contract — see tests/ui/test-live-now-hero.mjs):
//   - verdict points come from the scoring engine, never hardcoded copy;
//   - every verdict names its form when the user has more than one form;
//   - scores render through <Score>/<bdi> only (RTL: a concatenated
//     "קנדה 2-1 בוסניה" string visually swaps the leader);
//   - live data failing/missing degrades to the schedule-based fallback
//     ("משוחק עכשיו" pulse) — never a spinner, never a blank card;
//   - an official Firestore result removes the match from this card
//     entirely (the isLive selector already guarantees that).
//
// `matchResultsOverride` mirrors UpcomingMatches: the logged-out
// WelcomeScreen passes results fetched from the public endpoint since
// guests have no Firestore listeners. Guests get scores, no verdicts.

import { useMemo, useRef, useState } from "react";
import { useCurrentUser, useUserForms, useMatchResults } from "../hooks/useStore";
import { useUpcomingMatches } from "../hooks/useUpcomingMatches";
import { useLiveScores } from "../hooks/useLiveScores";
import { getTeamByCode } from "../data/teams";
import { ALL_MATCHES, STAGES } from "../data/matches";
import { getCachedBracket } from "../utils/bracketCache";
import { getMatchKickoffUTC } from "../utils/matchTime";
import {
  getMatchDateKey,
  formatMatchDateNumeric,
  formatMatchClock,
  dateKeyForNow,
  getUserTimeZone,
} from "../utils/userTime";
import {
  computeLiveVerdict,
  summarizeVerdicts,
} from "../utils/liveScores";
import {
  alignPredictionToActual,
  resolveMatchTeams,
} from "../utils/predictionAlign";
import { liveStatusInfo, findNextMatch, formatTimeLeft } from "../utils/liveNow";
import Score from "./Score";
import { LIVE } from "../constants/messages";

const STALE_AFTER_MS = 3 * 60 * 1000;
const COMPACT_THRESHOLD = 3;

function teamName(code) {
  if (!code) return "טרם נקבע";
  return getTeamByCode(code)?.name || code;
}

function StatusChip({ info }) {
  if (info.kind === "half") {
    return (
      <span className="badge-duo badge-duo-accent text-xs font-extrabold">
        {LIVE.halftime}
      </span>
    );
  }
  if (info.kind === "et") {
    return (
      <span className="badge-duo badge-duo-accent text-xs font-extrabold">
        {LIVE.extraTime}
      </span>
    );
  }
  if (info.kind === "finished") {
    return (
      <span className="badge-duo badge-duo-muted text-xs font-extrabold">
        {LIVE.finished}
      </span>
    );
  }
  // live (pulsing) — also used by the fallback row via LiveDot below.
  return (
    <span className="inline-flex items-center gap-1.5">
      <LiveDot />
      <span className="text-xs font-extrabold text-danger">
        {LIVE.liveChip}
        {Number.isInteger(info.minute) ? (
          <> · <bdi>{LIVE.minuteMark(info.minute)}</bdi></>
        ) : null}
      </span>
    </span>
  );
}

function LiveDot() {
  return (
    <span
      className="w-2 h-2 rounded-full bg-danger animate-pulse"
      aria-hidden="true"
    />
  );
}

// Verdict chip — points always arrive from computeLiveVerdict (scoring
// engine), copy never embeds a number. `finished` flips to past tense.
function VerdictText({ verdict, finished }) {
  if (!verdict) return null;
  if (verdict.kind === "exact") {
    return (
      <span className="font-extrabold text-primary-dark">
        {finished
          ? LIVE.finishedExact(verdict.points)
          : `${LIVE.exactNow} ${LIVE.exactWorth(verdict.points)}`}
      </span>
    );
  }
  if (verdict.kind === "outcome") {
    return (
      <span className="font-bold text-secondary">
        {finished
          ? LIVE.finishedOutcome(verdict.points)
          : LIVE.outcomeNow(verdict.points)}
      </span>
    );
  }
  if (verdict.kind === "none") {
    return (
      <span className="font-medium text-ink-muted">
        {finished ? LIVE.finishedNone : LIVE.noneNow}
      </span>
    );
  }
  if (verdict.kind === "suppressed") {
    return <span className="font-medium text-ink-muted">{LIVE.extraTimeNote}</span>;
  }
  if (verdict.kind === "different-teams") {
    return <span className="font-medium text-ink-muted">{LIVE.differentTeams}</span>;
  }
  return null; // no-data / no-prediction — nothing to claim
}

// One form's row inside an expanded match block: name · predicted score ·
// verdict. The predicted score stays visible here because the live match is
// removed from the UpcomingMatches list below (de-duplication) — this row
// is now the only place the user sees what they predicted.
function FormVerdictRow({ form, predDisplay, verdict, finished }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="flex-1 min-w-0 truncate font-medium text-ink">
        {form.formName || "טופס"}
      </span>
      {predDisplay ? (
        <Score
          home={predDisplay.homeScore}
          away={predDisplay.awayScore}
          className="tabular-nums font-bold shrink-0"
        />
      ) : (
        <span className="text-ink-muted shrink-0">—</span>
      )}
      <span className="text-left whitespace-nowrap">
        <VerdictText verdict={verdict} finished={finished} />
      </span>
    </div>
  );
}

// Centered "home — score — away" line. Mirrors UpcomingMatches' MatchRow
// flex structure (home is the FIRST child = right side in RTL) with the
// live score in the middle via <Score>.
function TeamsScoreLine({ homeCode, awayCode, live, large = false }) {
  const home = homeCode ? getTeamByCode(homeCode) : null;
  const away = awayCode ? getTeamByCode(awayCode) : null;
  const hasScore = live && live.homeScore != null && live.awayScore != null;
  const nameCls = large
    ? "font-heading font-extrabold text-lg md:text-xl"
    : "text-sm font-bold";
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex-1 min-w-0 text-center">
        <div className={`${nameCls} truncate ${home ? "text-ink" : "text-ink-muted italic"}`}>
          <bdi>{home?.name || "טרם נקבע"}</bdi>
        </div>
      </div>
      <div className={`shrink-0 ${large ? "text-xl md:text-2xl" : "text-sm"} font-black text-ink`}>
        {hasScore ? (
          <Score
            home={live.homeScore}
            away={live.awayScore}
            className="tabular-nums"
          />
        ) : (
          <span className="text-ink-muted">–</span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-center">
        <div className={`${nameCls} truncate ${away ? "text-ink" : "text-ink-muted italic"}`}>
          <bdi>{away?.name || "טרם נקבע"}</bdi>
        </div>
      </div>
    </div>
  );
}

// Per-form verdict section under an expanded match. Threshold pattern
// matches UpcomingMatches (1 inline / 2-4 rows / 5+ summary + details) so
// the two surfaces feel like one system. Never an unnamed verdict when the
// user has more than one form.
function VerdictSection({ forms, match, live, actualTeams, formBrackets, finished }) {
  const rows = useMemo(() => {
    return forms.map((form) => {
      const pred = form.matches?.[match.id];
      const formEntry =
        match.stage !== "group" ? formBrackets[form.formId]?.[match.id] : null;
      const verdict = computeLiveVerdict({
        prediction: pred,
        live,
        stage: match.stage || "group",
        predTeams: formEntry,
        actualTeams: match.stage !== "group" ? actualTeams : null,
      });
      // Align the displayed prediction to the actual home/away seating
      // (knockout slots may seat the same teams swapped).
      const predDisplay =
        pred && pred.homeScore != null && pred.awayScore != null &&
        verdict.kind !== "different-teams"
          ? match.stage !== "group"
            ? alignPredictionToActual(pred, formEntry, actualTeams)
            : pred
          : null;
      return { form, verdict, predDisplay };
    });
  }, [forms, match, live, actualTeams, formBrackets]);

  if (rows.length === 0) return null;

  if (rows.length === 1) {
    const { verdict, predDisplay } = rows[0];
    // no-data (feed down / unmapped fixture): still show the prediction —
    // the live match was removed from the UpcomingMatches list below, so
    // this line is the ONLY place the user sees what they predicted. Only
    // the verdict claim is omitted (nothing honest to claim without a
    // score). different-teams with nothing displayable is the one case
    // with no prediction to show.
    if (!predDisplay && verdict.kind !== "no-data") {
      return verdict.kind === "different-teams" ? (
        <div className="mt-2 pt-2 border-t border-border text-sm text-center">
          <VerdictText verdict={verdict} finished={finished} />
        </div>
      ) : null;
    }
    if (!predDisplay) return null;
    return (
      <div className="mt-2 pt-2 border-t border-border text-sm text-center">
        <span className="text-xs text-ink-muted">{LIVE.yourPrediction} </span>
        <Score
          home={predDisplay.homeScore}
          away={predDisplay.awayScore}
          className="tabular-nums font-bold"
        />
        {verdict.kind !== "no-data" && (
          <div className="mt-0.5">
            <VerdictText verdict={verdict} finished={finished} />
          </div>
        )}
      </div>
    );
  }

  const body = (
    <div className="md:grid md:grid-cols-2 md:gap-x-4">
      {rows.map(({ form, verdict, predDisplay }) => (
        <FormVerdictRow
          key={form.formId}
          form={form}
          predDisplay={predDisplay}
          verdict={verdict}
          finished={finished}
        />
      ))}
    </div>
  );

  if (rows.length <= 4) {
    return (
      <div className="mt-2 pt-2 border-t border-border">
        <div className="text-xs text-ink-muted mb-0.5">
          {LIVE.yourForms(rows.length)}
        </div>
        {body}
      </div>
    );
  }

  const { scoring, total } = summarizeVerdicts(rows.map((r) => r.verdict));
  return (
    <details className="mt-2 pt-2 border-t border-border">
      <summary className="text-xs font-bold text-ink-muted cursor-pointer select-none">
        {LIVE.formsScoringNow(scoring, total)}
      </summary>
      <div className="mt-1">{body}</div>
    </details>
  );
}

// Compact one-line row for simultaneous-kickoff days. Single form shows its
// verdict word; multiple forms show only the count chip ("✓ 2/8") — an
// unattributed "מדויק" with 8 forms would be a lie.
function CompactRow({ match, actualTeams, live, forms, formBrackets, onToggle, expanded }) {
  const info = liveStatusInfo(live, match.stage || "group");
  const finished = info.kind === "finished";
  // Memoized: compact mode exists exactly for busy days (4 live matches ×
  // many forms), where recomputing every verdict on each 60s clock tick
  // adds up. Recomputes only when a poll actually changes `live`.
  const verdicts = useMemo(
    () =>
      forms.map((form) =>
        computeLiveVerdict({
          prediction: form.matches?.[match.id],
          live,
          stage: match.stage || "group",
          predTeams:
            match.stage !== "group" ? formBrackets[form.formId]?.[match.id] : null,
          actualTeams: match.stage !== "group" ? actualTeams : null,
        }),
      ),
    [forms, live, match, formBrackets, actualTeams],
  );
  const { scoring, total } = summarizeVerdicts(verdicts);

  // The expandable section lives OUTSIDE the toggle button — VerdictSection
  // can contain a <details>, and interactive content inside a <button> is
  // invalid HTML (and unreachable for keyboard users).
  return (
    <div className="rounded-xl border border-border bg-white p-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-right bg-transparent border-none p-0 tap-44 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <TeamsScoreLine
              homeCode={actualTeams.home}
              awayCode={actualTeams.away}
              live={live}
            />
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <StatusChip info={info} />
            {forms.length === 1 && verdicts[0]?.kind === "exact" && (
              <span className="text-xs font-extrabold text-primary-dark">מדויק ✓</span>
            )}
            {forms.length === 1 && verdicts[0]?.kind === "outcome" && (
              <span className="text-xs font-bold text-secondary">הכרעה ✓</span>
            )}
            {forms.length > 1 && total > 0 && (
              <span className="text-xs font-bold text-ink-muted">
                <bdi>✓ {scoring}/{total}</bdi>
              </span>
            )}
          </div>
        </div>
      </button>
      {expanded && (
        <VerdictSection
          forms={forms}
          match={match}
          live={live}
          actualTeams={actualTeams}
          formBrackets={formBrackets}
          finished={finished}
        />
      )}
    </div>
  );
}

// Full block for one live match (the non-compact layout).
function MatchLiveBlock({ match, actualTeams, live, forms, formBrackets }) {
  const info = liveStatusInfo(live, match.stage || "group");
  const finished = info.kind === "finished";
  const stageLabel = STAGES[match.stage] || "";

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="text-xs font-medium text-secondary/90 text-center mb-1">
        {stageLabel}
        {match.group ? ` · ${match.group}` : ""}
      </div>
      <div className="flex items-center justify-center gap-2 mb-1.5">
        {info.kind === "fallback" ? (
          <span className="inline-flex items-center gap-1.5">
            <LiveDot />
            <span className="text-xs font-extrabold text-danger">
              {LIVE.playingNow}
            </span>
            {match.venue && (
              <span className="text-xs text-ink-muted">· {match.venue}</span>
            )}
          </span>
        ) : (
          <StatusChip info={info} />
        )}
      </div>
      <TeamsScoreLine
        homeCode={actualTeams.home}
        awayCode={actualTeams.away}
        live={live}
        large
      />
      <VerdictSection
        forms={forms}
        match={match}
        live={live}
        actualTeams={actualTeams}
        formBrackets={formBrackets}
        finished={finished}
      />
    </div>
  );
}

// Next scheduled match with no recorded result, looking beyond the 24h
// upcoming window (rest days between rounds).
// Quiet pre-match / rest-day strip. Deliberately does NOT repeat the user's
// predictions — the UpcomingMatches list right below shows them; repeating
// here was exactly the redundancy that killed the old MatchdayHero.
function NextMatchStrip({ results, now }) {
  const next = findNextMatch(results, now);
  if (!next) return null;
  const { match, kickoff } = next;
  const teams = resolveMatchTeams(match, getCachedBracket(results || {}));
  const tz = getUserTimeZone();
  const todayKey = dateKeyForNow(now, tz);
  const isToday = getMatchDateKey(match, tz) === todayKey;
  const remainingToday = isToday
    ? ALL_MATCHES.filter(
        (m) =>
          !results?.[m.id] &&
          getMatchDateKey(m, tz) === todayKey &&
          (getMatchKickoffUTC(m) ?? 0) > now &&
          m.id !== match.id,
      ).length
    : 0;

  return (
    <div className="card-duo mb-3">
      <div className="text-xs font-extrabold text-ink-muted mb-1">
        {isToday ? LIVE.startsIn(formatTimeLeft(kickoff - now)) : LIVE.nextMatchLabel}
      </div>
      <div className="font-heading font-extrabold text-lg text-ink">
        <bdi>{teamName(teams.home)}</bdi>{" "}
        <span className="text-ink-muted">{LIVE.versus}</span>{" "}
        <bdi>{teamName(teams.away)}</bdi>
      </div>
      <div className="text-sm font-bold text-ink-muted mt-0.5">
        {isToday ? (
          <>{LIVE.todayAt(formatMatchClock(match, tz))}{match.venue ? ` · ${match.venue}` : ""}</>
        ) : (
          <>
            <bdi>{formatMatchDateNumeric(match, tz)}</bdi> · <bdi>{formatMatchClock(match, tz)}</bdi>
            {match.venue ? ` · ${match.venue}` : ""}
          </>
        )}
      </div>
      {remainingToday > 0 && (
        <div className="text-xs font-bold text-ink-muted mt-1.5">
          {LIVE.moreToday(remainingToday)}
        </div>
      )}
    </div>
  );
}

function FreshnessFooter({ fetchedAt, failures, now }) {
  let text = LIVE.refreshNote;
  if (failures >= 2) {
    text = LIVE.apiDownNote;
  } else if (fetchedAt && now - fetchedAt > STALE_AFTER_MS) {
    text = LIVE.staleNote(Math.round((now - fetchedAt) / 60000));
  }
  return (
    <div className="text-[10px] md:text-xs text-ink-muted text-center mt-2">
      {text}
    </div>
  );
}

export default function LiveNowCard({ matchResultsOverride }: { matchResultsOverride?: Record<string, any> } = {}) {
  const { user } = useCurrentUser();
  const userForms = useUserForms(user?.id || null);
  const storeResults = useMatchResults();
  const results = matchResultsOverride ?? storeResults;
  const matches = useUpcomingMatches(matchResultsOverride);
  const now = Date.now();

  // Only submitted/approved forms score — a stray draft must not get a
  // points-bearing verdict.
  const forms = useMemo(
    () =>
      userForms.filter(
        (f) => f.status === "submitted" || f.status === "approved",
      ),
    [userForms],
  );

  const liveMatches = useMemo(() => matches.filter((m) => m.isLive), [matches]);

  const actualBracket = useMemo(
    () => getCachedBracket(results || {}),
    [results],
  );
  const formBrackets = useMemo(() => {
    const map = {};
    for (const form of forms) {
      map[form.formId] = getCachedBracket(form.matches || {});
    }
    return map;
  }, [forms]);

  const { scores, fetchedAt, failures } = useLiveScores(
    liveMatches,
    actualBracket,
  );

  // Compact mode is sticky per cohort: entering at >= COMPACT_THRESHOLD
  // simultaneous matches, leaving only when the card empties — so the
  // layout doesn't reshuffle mid-viewing as matches finish one by one.
  const compactRef = useRef(false);
  if (liveMatches.length >= COMPACT_THRESHOLD) compactRef.current = true;
  if (liveMatches.length === 0) compactRef.current = false;
  const compact = compactRef.current;

  const [expandedId, setExpandedId] = useState(null);

  if (liveMatches.length === 0) {
    return <NextMatchStrip results={results} now={now} />;
  }

  return (
    <div
      className="card-duo-lg mb-3 text-right"
      style={{ borderColor: "var(--color-primary)" }}
    >
      {/* No card-level "לייב" banner: each match block carries its own
          StatusChip (live + minute / halftime / ET / finished), so a single
          live match would otherwise show "לייב" twice. The green border is
          the card's live identity. aria-live region: a goal announces as one
          sentence (atomic), and only politely — downgrades stay silent. */}
      <div aria-live="polite" aria-atomic="true" className="space-y-2.5">
        {liveMatches.map((match) => {
          const actualTeams = resolveMatchTeams(match, actualBracket);
          const live = scores[match.id] || null;
          return compact ? (
            <CompactRow
              key={match.id}
              match={match}
              actualTeams={actualTeams}
              live={live}
              forms={forms}
              formBrackets={formBrackets}
              expanded={expandedId === match.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === match.id ? null : match.id))
              }
            />
          ) : (
            <MatchLiveBlock
              key={match.id}
              match={match}
              actualTeams={actualTeams}
              live={live}
              forms={forms}
              formBrackets={formBrackets}
            />
          );
        })}
      </div>
      <FreshnessFooter fetchedAt={fetchedAt} failures={failures} now={now} />
    </div>
  );
}
