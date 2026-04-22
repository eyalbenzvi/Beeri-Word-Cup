import { useState, useMemo } from "react";
import {
  useAllPredictions,
  useUsers,
  useSettings,
  useCurrentUser,
} from "../hooks/useStore";
import { normalizeStatus } from "../utils/helpers";
import {
  generateGroupMatches,
  generateKnockoutMatches,
  STAGES,
} from "../data/matches";
import { GROUPS, getTeamByCode } from "../data/teams";
import { getCachedChampion, getCachedBracket } from "../utils/bracketCache";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";

const groupMatches = generateGroupMatches();
const knockoutMatches = generateKnockoutMatches();
const EMPTY_MATCHES = {};


function MatchRow({ match, prediction }) {
  const home = getTeamByCode(match.homeTeam);
  const away = getTeamByCode(match.awayTeam);
  const homeName = home?.name || "טרם נקבע";
  const awayName = away?.name || "טרם נקבע";
  const hasScore =
    prediction?.homeScore != null && prediction?.awayScore != null;

  const isTie =
    match.stage !== "group" &&
    hasScore &&
    prediction.homeScore === prediction.awayScore &&
    prediction.advancingTeam;

  return (
    <div className="py-1.5 border-b border-border last:border-0 text-xs">
      <div className="flex items-center justify-between">
        <span className="flex-1 text-right truncate text-ink font-medium">{homeName}</span>
        <span className="w-16 text-center font-extrabold text-ink tabular-nums">
          {hasScore ? <span dir="ltr">{prediction.awayScore} – {prediction.homeScore}</span> : "–"}
        </span>
        <span className="flex-1 text-left truncate text-ink font-medium">{awayName}</span>
      </div>
      {isTie && (
        <div className="text-[10px] text-ink-muted font-bold text-center mt-0.5">
          בעיטות הכרעה: {getTeamByCode(prediction.advancingTeam)?.name}
        </div>
      )}
    </div>
  );
}

function FormCard({ form, championDisplay, locked, isOwnForm, userName, playerList }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = locked || isOwnForm;
  const predictions = form.matches || EMPTY_MATCHES;
  // Lazy: only compute bracket when the card is expanded (not for all 250 forms on load)
  const bracketTeams = useMemo(
    () => expanded ? getCachedBracket(predictions) : null,
    [predictions, expanded],
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-border overflow-hidden">
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 p-4 text-right bg-transparent border-none ${canExpand ? "cursor-pointer hover:bg-bg-soft" : "cursor-default"}`}
      >
        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-extrabold text-sm flex-shrink-0 border-2 border-primary-dark">
          {(form.formName || "?")[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm truncate text-ink">
            {form.formName || "טופס ללא שם"}
          </div>
          {userName && (
            <div className="text-xs text-ink-muted font-medium truncate">{userName}</div>
          )}
          {canExpand ? (
            <>
              {championDisplay && (
                <div className="text-xs text-accent-text font-bold mt-0.5">
                  🏆 {championDisplay}
                </div>
              )}
              {form.topScorer && (
                <div className="text-xs text-ink-muted font-medium mt-0.5">
                  ⚽ {getPlayerDisplayName(form.topScorer, playerList)}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-ink-muted font-medium mt-0.5">
              🔒 הניחושים יוצגו לאחר נעילת הטורניר
            </div>
          )}
        </div>
        {canExpand && (
          <span className="text-ink-muted text-sm font-bold">{expanded ? "▾" : "▸"}</span>
        )}
      </button>

      {expanded && canExpand && (
        <div className="px-4 pb-4 space-y-3">
          {Object.keys(GROUPS).map((group) => {
            const matches = groupMatches.filter((m) => m.group === group);
            return (
              <div key={group}>
                <div className="text-xs font-extrabold text-ink-muted mb-1">
                  בית {group}
                </div>
                {matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    prediction={predictions[m.id]}
                  />
                ))}
              </div>
            );
          })}

          {["R32", "R16", "QF", "SF", "3RD", "F"].map((stage) => {
            const matches = knockoutMatches.filter((m) => m.stage === stage);
            if (matches.length === 0) return null;
            return (
              <div key={stage}>
                <div className="text-xs font-extrabold text-ink-muted mb-1">
                  {STAGES[stage]}
                </div>
                {matches.map((m) => {
                  const derived = bracketTeams[m.id]
                    ? {
                        ...m,
                        homeTeam: bracketTeams[m.id].home,
                        awayTeam: bracketTeams[m.id].away,
                      }
                    : m;
                  return (
                    <MatchRow
                      key={m.id}
                      match={derived}
                      prediction={predictions[m.id]}
                    />
                  );
                })}
              </div>
            );
          })}

          <div className="pt-2 border-t-2 border-border">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted font-bold">⚽ מלך שערים</span>
              <span className="font-extrabold text-ink">
                {form.topScorer ? getPlayerDisplayName(form.topScorer, playerList) : "לא הוכנס"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AllFormsView({ onBack }) {
  const allPredictions = useAllPredictions();
  const users = useUsers();
  const settings = useSettings();
  const { user } = useCurrentUser();
  const locked = settings.predictionsLocked;
  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );
  const [filterText, setFilterText] = useState("");
  const [filterBy, setFilterBy] = useState("form");

  const submittedForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([, form]) => normalizeStatus(form.status) === "submitted")
      .map(([formId, form]) => {
        const predictions = form.matches || EMPTY_MATCHES;
        const championCode = getCachedChampion(predictions);
        const championTeam = championCode ? getTeamByCode(championCode) : null;
        return {
          formId,
          ...form,
          championCode,
          championName: championTeam?.name || null,
        };
      })
      .sort((a, b) => (a.formName || "").localeCompare(b.formName || ""));
  }, [allPredictions]);

  const activeFilter = locked ? filterBy : "form";

  const filteredForms = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return submittedForms;
    return submittedForms.filter((form) => {
      if (activeFilter === "form") {
        return (form.formName || "").toLowerCase().includes(query);
      }
      return (form.championName || "").toLowerCase().includes(query);
    });
  }, [submittedForms, filterText, activeFilter, users]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">
          כל הטפסים
        </h1>
        <button
          onClick={onBack}
          className="btn-duo-flat"
          style={{ background: "var(--color-secondary)", color: "white", padding: "0.45rem 1rem" }}
        >
          חזרה →
        </button>
      </div>

      {submittedForms.length === 0 ? (
        <div className="text-center py-12 card-duo-lg">
          <div className="text-6xl mb-3">📋</div>
          <p className="text-ink-muted font-medium">אין טפסים שהוגשו עדיין</p>
        </div>
      ) : (
        <>
          {/* Filter controls */}
          <div className="card-duo mb-3">
            {locked && (
              <div className="flex gap-1 mb-2.5 bg-bg-soft rounded-xl p-1 border-2 border-border">
                {[
                  { id: "form", label: "לפי טופס" },
                  { id: "champion", label: "לפי אלופה" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setFilterBy(tab.id);
                      setFilterText("");
                    }}
                    className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition border-none cursor-pointer ${
                      filterBy === tab.id
                        ? "bg-white text-ink"
                        : "bg-transparent text-ink-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="חפש לפי שם טופס..."
              className="input-duo"
            />
          </div>

          <p className="text-sm text-ink-muted mb-3 font-bold">
            {filteredForms.length === submittedForms.length
              ? `${submittedForms.length} טפסים הוגשו • לחץ על טופס לצפייה`
              : `מציג ${filteredForms.length} מתוך ${submittedForms.length} טפסים`}
          </p>
          {!locked && (
            <div className="border-2 border-accent rounded-2xl p-4 mb-3 text-center" style={{ background: "#FFF8E1" }}>
              <div className="text-3xl mb-1">🔒</div>
              <div className="text-base font-extrabold text-accent-text">
                הניחושים עדיין לא גלויים
              </div>
              <div className="text-xs text-accent-text mt-1 font-medium">
                ניתן לראות את שמות הטפסים, אך הניחושים יוצגו רק לאחר תחילת
                המשחקים
              </div>
            </div>
          )}
          <div className="space-y-2">
            {filteredForms.map((form) => {
              const u = users[form.userId];
              const userName = u?.firstName
                ? (u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName)
                : u?.displayName || null;
              return (
                <FormCard
                  key={form.formId}
                  form={form}
                  championDisplay={form.championName}
                  locked={locked}
                  isOwnForm={form.userId === user?.id}
                  userName={userName}
                  playerList={playerList}
                />
              );
            })}
            {filteredForms.length === 0 && (
              <div className="text-center py-6 text-ink-muted text-sm font-medium">
                לא נמצאו טפסים תואמים
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
