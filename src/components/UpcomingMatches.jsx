import { useMemo } from "react";
import { useCurrentUser, useUserForms, useMatchResults } from "../hooks/useStore";
import { useUpcomingMatches } from "../hooks/useUpcomingMatches";
import { getTeamByCode } from "../data/teams";
import { STAGES } from "../data/matches";
import { getCachedBracket } from "../utils/bracketCache";
import { formatIsraelDateLabel } from "../utils/matchTime";
import { isScoreValid } from "../utils/helpers";
import {
  alignPredictionToActual,
  resolveMatchTeams,
  teamsMatch,
} from "../utils/predictionAlign";

const STAGE_LABELS = STAGES;

function teamName(code) {
  if (!code) return "טרם נקבע";
  return getTeamByCode(code)?.name || code;
}

function FormPredictionRow({ form, match, actualTeams, formBracket }) {
  const pred = form.matches?.[match.id];
  const valid = isScoreValid(pred);

  const isKnockout = match.stage !== "group";
  const formEntry = isKnockout ? formBracket?.[match.id] : null;
  let bracketMismatch = false;
  if (isKnockout) {
    // Can only compare when both sides have resolved teams.
    if (!actualTeams.home || !actualTeams.away) {
      // Actual teams not yet determined — can't verify alignment; hide to
      // avoid mis-displaying a prediction against an unknown matchup.
      bracketMismatch = true;
    } else if (!teamsMatch(formEntry, actualTeams)) {
      bracketMismatch = true;
    }
  }

  const formLabel = form.formName || "טופס";
  const showPrediction = valid && !bracketMismatch;
  const aligned = showPrediction && isKnockout
    ? alignPredictionToActual(pred, formEntry, actualTeams)
    : { homeScore: pred?.homeScore, awayScore: pred?.awayScore, advancingTeam: pred?.advancingTeam };

  return (
    <div
      className={`flex items-center justify-between gap-2 py-1 text-xs ${
        bracketMismatch ? "text-ink-muted/50" : "text-ink"
      }`}
    >
      <span className="flex-1 min-w-0 truncate font-medium">{formLabel}</span>
      {showPrediction ? (
        <bdi className="tabular-nums font-bold">
          {aligned.awayScore}–{aligned.homeScore}
        </bdi>
      ) : bracketMismatch ? (
        <span className="text-xs">קבוצות שונות בטופס</span>
      ) : (
        <span className="text-ink-muted">—</span>
      )}
      {showPrediction &&
        isKnockout &&
        aligned.homeScore === aligned.awayScore &&
        aligned.advancingTeam && (
          <span className="text-[10px] text-ink-muted whitespace-nowrap">
            מעפילה: {teamName(aligned.advancingTeam)}
          </span>
        )}
    </div>
  );
}

function PredictionsList({ forms, match, actualTeams, formBrackets }) {
  if (forms.length === 0) return null;

  const rows = forms.map((form) => (
    <FormPredictionRow
      key={form.formId}
      form={form}
      match={match}
      actualTeams={actualTeams}
      formBracket={formBrackets[form.formId]}
    />
  ));

  // 1 form: inline, no heading. 2-4: expanded list. 5+: collapsible <details>.
  if (forms.length === 1) {
    return (
      <div className="mt-2 pt-2 border-t border-border">
        <div className="text-xs text-ink-muted mb-0.5">הניחוש שלך</div>
        {rows}
      </div>
    );
  }

  if (forms.length <= 4) {
    return (
      <div className="mt-2 pt-2 border-t border-border">
        <div className="text-xs text-ink-muted mb-0.5">
          הניחושים שלך ({forms.length})
        </div>
        <div className="md:grid md:grid-cols-2 md:gap-x-4">{rows}</div>
      </div>
    );
  }

  return (
    <details className="mt-2 pt-2 border-t border-border">
      <summary className="text-xs text-ink-muted cursor-pointer select-none">
        הניחושים שלך ({forms.length})
      </summary>
      <div className="md:grid md:grid-cols-2 md:gap-x-4 mt-1">{rows}</div>
    </details>
  );
}

function MatchRow({ match, actualTeams }) {
  const home = actualTeams.home ? getTeamByCode(actualTeams.home) : null;
  const away = actualTeams.away ? getTeamByCode(actualTeams.away) : null;
  const stageLabel = STAGE_LABELS[match.stage] || "";
  const meta = [match.date, match.time, match.venue].filter(Boolean).join(" · ");

  // Stacked + centered layout: stage label on top, teams in the middle,
  // date/time/venue on the bottom. Keeps everything visually balanced in
  // narrow containers (two-column grid cards are ~240px wide on desktop).
  return (
    <>
      <div className="text-xs font-medium text-secondary/90 text-center mb-1">
        {stageLabel}
        {match.group ? ` · ${match.group}` : ""}
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="flex-1 min-w-0 text-center">
          <div
            className={`text-sm font-medium truncate ${
              home ? "text-ink" : "text-ink-muted italic"
            }`}
          >
            <bdi>{home?.name || "טרם נקבע"}</bdi>
          </div>
        </div>
        <div className="text-sm text-ink-muted font-black shrink-0">–</div>
        <div className="flex-1 min-w-0 text-center">
          <div
            className={`text-sm font-medium truncate ${
              away ? "text-ink" : "text-ink-muted italic"
            }`}
          >
            <bdi>{away?.name || "טרם נקבע"}</bdi>
          </div>
        </div>
      </div>
      {meta && (
        <div className="text-xs text-ink-muted text-center mt-1">{meta}</div>
      )}
    </>
  );
}

// Rendered inline in the main content column on both Home and WelcomeScreen.
// Grid switches to two columns on md+ so multiple matches fit without
// sprawling vertically.
// `matchResultsOverride` is used by the logged-out WelcomeScreen path, which
// has no Firestore listeners and must get results from the public endpoint.
export default function UpcomingMatches({ matchResultsOverride } = {}) {
  const { user } = useCurrentUser();
  const userForms = useUserForms(user?.id || null);
  const matches = useUpcomingMatches(matchResultsOverride);
  const storeResults = useMatchResults();
  const matchResults = matchResultsOverride ?? storeResults;

  const actualBracket = useMemo(
    () => getCachedBracket(matchResults || {}),
    [matchResults],
  );

  const formBrackets = useMemo(() => {
    const map = {};
    for (const form of userForms) {
      map[form.formId] = getCachedBracket(form.matches || {});
    }
    return map;
  }, [userForms]);

  if (matches.length === 0) {
    return (
      <div className="card-duo-lg text-center text-sm text-ink-muted font-medium">
        אין משחקים קרובים להצגה כרגע
      </div>
    );
  }

  const headingDate = formatIsraelDateLabel(matches[0]);

  return (
    <div className="card-duo text-right">
      <div className="text-xs font-extrabold text-ink-muted mb-3 text-center">
        המשחקים הבאים
        {headingDate ? ` · ${headingDate}` : ""} ({matches.length})
      </div>
      <div
        className={
          matches.length === 1
            ? "space-y-3"
            : "space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0"
        }
      >
        {matches.map((match) => {
          const actualTeams = resolveMatchTeams(match, actualBracket);
          return (
            <div
              key={match.id}
              className="rounded-xl border border-border p-3 bg-white"
            >
              <MatchRow match={match} actualTeams={actualTeams} />
              {user && (
                <PredictionsList
                  forms={userForms}
                  match={match}
                  actualTeams={actualTeams}
                  formBrackets={formBrackets}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
