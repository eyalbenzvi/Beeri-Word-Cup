// Recent-results section — the calm catch-up band on the home page, sitting
// between the live hero and the rest of the page (above UpcomingMatches so a
// freshly-decided result stays visible). A match appears here once it has a
// recorded result and until finishedExpiryUTC closes (4h from its estimated
// end, but never before noon Israel — so overnight matches stay up for
// morning-risers, the primary audience), then drops off on its own.
//
// Design contract (mirrors LiveNowCard's truth rules, see tests/ui/
// test-recently-finished.mjs):
//   - the score is OFFICIAL (from matchResults), rendered through <Score>/<bdi>
//     only (RTL: a concatenated "קנדה 2-1 בוסניה" visually swaps the leader);
//   - per-form verdict points come from the scoring engine via
//     computeLiveVerdict — never hardcoded copy — using past-tense wording;
//   - every verdict names its form when the user has more than one form;
//   - visual register is deliberately quiet (muted "הסתיים" badge, no live
//     red, no pulse) so it never competes with the live hero above.

import { useMemo, useState } from "react";
import { useCurrentUser, useUserForms, useMatchResults } from "../hooks/useStore";
import { useRecentlyFinishedMatches } from "../hooks/useUpcomingMatches";
import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";
import { getCachedBracket } from "../utils/bracketCache";
import { computeLiveVerdict, FD_FINISHED_STATUS } from "../utils/liveScores";
import {
  alignPredictionToActual,
  resolveMatchTeams,
} from "../utils/predictionAlign";
import Score from "./Score";
import ResultBreakdown from "./ResultBreakdown";
import { FINISHED, LIVE } from "../constants/messages";

// How many finished matches render expanded before the rest collapse into a
// <details>. A busy match day can finish 4+ fixtures at once; capping keeps
// the section from shoving ScoreStrip / UpcomingMatches far down the page.
const VISIBLE_CAP = 4;

// Past-tense verdict line. Points always arrive from computeLiveVerdict
// (scoring engine); copy never embeds a number.
function VerdictText({ verdict }) {
  if (!verdict) return null;
  if (verdict.kind === "exact") {
    return (
      <span className="font-extrabold text-primary-dark">
        {LIVE.finishedExact(verdict.points)}
      </span>
    );
  }
  if (verdict.kind === "outcome") {
    return (
      <span className="font-bold text-secondary">
        {LIVE.finishedOutcome(verdict.points)}
      </span>
    );
  }
  if (verdict.kind === "none") {
    return <span className="font-medium text-ink-muted">{LIVE.finishedNone}</span>;
  }
  if (verdict.kind === "different-teams") {
    return <span className="font-medium text-ink-muted">{LIVE.differentTeams}</span>;
  }
  return null; // no-data / no-prediction — nothing honest to claim
}

// Centered "home — final score — away" line. Mirrors LiveNowCard's
// TeamsScoreLine flex structure (home first = right side in RTL).
function TeamsScoreLine({ homeCode, awayCode, result }) {
  const home = homeCode ? getTeamByCode(homeCode) : null;
  const away = awayCode ? getTeamByCode(awayCode) : null;
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex-1 min-w-0 text-center">
        <div className={`text-sm font-bold truncate ${home ? "text-ink" : "text-ink-muted italic"}`}>
          <bdi>{home?.name || "טרם נקבע"}</bdi>
        </div>
      </div>
      <div className="shrink-0 text-base font-black text-ink">
        <Score home={result.homeScore} away={result.awayScore} className="tabular-nums" />
      </div>
      <div className="flex-1 min-w-0 text-center">
        <div className={`text-sm font-bold truncate ${away ? "text-ink" : "text-ink-muted italic"}`}>
          <bdi>{away?.name || "טרם נקבע"}</bdi>
        </div>
      </div>
    </div>
  );
}

function FormVerdictRow({ form, predDisplay, verdict }) {
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
        <VerdictText verdict={verdict} />
      </span>
    </div>
  );
}

// Per-form earned-points section. Threshold pattern matches the live/upcoming
// surfaces (1 inline / 2+ rows) so the three sections feel like one system.
function VerdictSection({ forms, match, live, actualTeams, formBrackets }) {
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
    if (!predDisplay) {
      return verdict.kind === "different-teams" ? (
        <div className="mt-2 pt-2 border-t border-border text-sm text-center">
          <VerdictText verdict={verdict} />
        </div>
      ) : null;
    }
    return (
      <div className="mt-2 pt-2 border-t border-border text-sm text-center">
        <span className="text-xs text-ink-muted">{LIVE.yourPrediction} </span>
        <Score
          home={predDisplay.homeScore}
          away={predDisplay.awayScore}
          className="tabular-nums font-bold"
        />
        <div className="mt-0.5">
          <VerdictText verdict={verdict} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <div className="text-xs text-ink-muted mb-0.5">{LIVE.yourForms(rows.length)}</div>
      {/* Single column on every breakpoint: the cards themselves render two-up
          on desktop (see the outer grid below), so a second nested two-column
          grid here left each verdict cell only ~quarter-page wide — the
          whitespace-nowrap verdict line then overflowed and adjacent columns
          collided into garbled overlap. Full card width fits every verdict. */}
      <div>
        {rows.map(({ form, verdict, predDisplay }) => (
          <FormVerdictRow
            key={form.formId}
            form={form}
            predDisplay={predDisplay}
            verdict={verdict}
          />
        ))}
      </div>
    </div>
  );
}

function FinishedBlock({ match, actualTeams, forms, formBrackets }) {
  const stageLabel = STAGES[match.stage] || "";
  // Feed the official result through the (live) verdict engine as a FINISHED
  // snapshot: REGULAR duration + no minute means the knockout-ET suppression
  // never triggers, so the verdict reflects the official 90' scoring.
  const live = useMemo(
    () => ({ ...match.result, status: FD_FINISHED_STATUS, duration: "REGULAR", minute: null }),
    [match.result],
  );
  return (
    <div className="rounded-xl border border-border bg-bg-soft p-3">
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-xs font-medium text-secondary/90">
          {stageLabel}
          {match.group ? ` · ${match.group}` : ""}
        </span>
        <span className="badge-duo badge-duo-muted text-xs font-extrabold">
          {FINISHED.badge}
        </span>
      </div>
      <TeamsScoreLine
        homeCode={actualTeams.home}
        awayCode={actualTeams.away}
        result={match.result}
      />
      <div className="text-center mt-0.5">
        <ResultBreakdown result={match.result} variant="line" />
      </div>
      {forms.length > 0 && (
        <VerdictSection
          forms={forms}
          match={match}
          live={live}
          actualTeams={actualTeams}
          formBrackets={formBrackets}
        />
      )}
    </div>
  );
}

// `matchResultsOverride` mirrors LiveNowCard/UpcomingMatches: the logged-out
// WelcomeScreen passes results fetched from the public endpoint since guests
// have no Firestore listeners. Guests see scores, no verdicts.
export default function RecentlyFinishedMatches(
  { matchResultsOverride }: { matchResultsOverride?: Record<string, any> } = {},
) {
  const { user } = useCurrentUser();
  const userForms = useUserForms(user?.id || null);
  const storeResults = useMatchResults();
  const results = matchResultsOverride ?? storeResults;
  const matches = useRecentlyFinishedMatches(matchResultsOverride);

  // Only submitted/approved forms score — a stray draft must not earn a verdict.
  const forms = useMemo(
    () =>
      userForms.filter((f) => f.status === "submitted" || f.status === "approved"),
    [userForms],
  );

  const actualBracket = useMemo(() => getCachedBracket(results || {}), [results]);
  const formBrackets = useMemo(() => {
    const map = {};
    for (const form of forms) {
      map[form.formId] = getCachedBracket(form.matches || {});
    }
    return map;
  }, [forms]);

  // Resolve each match's teams once, and drop any knockout fixture whose slot
  // can't be seated yet (rare out-of-order admin entry): a real score under
  // "טרם נקבע / טרם נקבע" would read as a broken card, so we hide it until the
  // bracket fills in. Group fixtures always resolve to their fixed teams.
  const renderable = useMemo(
    () =>
      matches
        .map((match) => ({ match, actualTeams: resolveMatchTeams(match, actualBracket) }))
        .filter(({ actualTeams }) => actualTeams.home && actualTeams.away),
    [matches, actualBracket],
  );

  const [expanded, setExpanded] = useState(false);

  if (renderable.length === 0) return null;

  const visible = expanded ? renderable : renderable.slice(0, VISIBLE_CAP);
  const hiddenCount = renderable.length - visible.length;

  return (
    <div className="card-duo mb-3 text-right">
      <div className="text-xs font-extrabold text-ink-muted mb-3 text-center">
        {FINISHED.header} ({renderable.length})
      </div>
      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {visible.map(({ match, actualTeams }) => (
          <FinishedBlock
            key={match.id}
            match={match}
            actualTeams={actualTeams}
            forms={forms}
            formBrackets={formBrackets}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs font-bold text-secondary tap-44 bg-transparent border-none cursor-pointer w-full"
        >
          {FINISHED.showMore(hiddenCount)}
        </button>
      )}
    </div>
  );
}
