import { useEffect, useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import FormAvatar from "../components/FormAvatar";
import FormSummaryLines from "../components/FormSummaryLines";
import FormMatchesView from "../components/FormMatchesView";
import {
  useAllPredictions,
  useUserDirectory,
  useSettings,
  useCurrentUser,
} from "../hooks/useStore";
import { normalizeStatus } from "../utils/helpers";
import { getTeamByCode } from "../data/teams";
import { getCachedChampion } from "../utils/bracketCache";
import { getPlayerDisplayName, resolvePlayerList } from "../utils/playerSearch";
import { LOCK_MESSAGES, LABELS } from "../constants/messages";

const EMPTY_MATCHES = {};


function FormCard({ form, championDisplay, locked, isOwnForm, userName, playerList, expanded, onToggle }) {
  const canExpand = locked || isOwnForm;
  const predictions = form.matches || EMPTY_MATCHES;

  const topScorerName = form.topScorer
    ? getPlayerDisplayName(form.topScorer, playerList)
    : null;

  return (
    <div className="bg-white rounded-2xl border-2 border-border overflow-hidden">
      <button
        onClick={() => canExpand && onToggle?.()}
        aria-expanded={!!expanded}
        className={`w-full flex items-center gap-3 p-4 text-right bg-transparent border-none ${canExpand ? "cursor-pointer hover:bg-bg-soft" : "cursor-default"}`}
      >
        <FormAvatar form={form} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm truncate text-ink">
            {form.formName || "טופס ללא שם"}
          </div>
          {userName && (
            <div className="text-xs text-ink-muted font-medium truncate">{userName}</div>
          )}
          {canExpand ? (
            <FormSummaryLines
              championName={championDisplay}
              topScorerName={topScorerName}
            />
          ) : (
            <div className="text-xs text-ink-muted font-medium mt-0.5">
              🔒 {LOCK_MESSAGES.predictionsHiddenBeforeLock}
            </div>
          )}
        </div>
        {canExpand && (
          <span className="text-ink-muted text-sm font-bold">{expanded ? "▾" : "▸"}</span>
        )}
      </button>

      {expanded && canExpand && (
        <div className="px-4 pb-4">
          <FormMatchesView predictions={predictions} />

          <div className="pt-2 mt-3 border-t-2 border-border">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted font-bold">⚽ {LABELS.topScorer}</span>
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
  const users = useUserDirectory();
  const settings = useSettings();
  const { user } = useCurrentUser();
  const locked = settings.predictionsLocked;
  const playerList = useMemo(
    () => resolvePlayerList(settings.topScorerPlayers),
    [settings.topScorerPlayers],
  );
  const [filterText, setFilterText] = useState("");
  const [filterBy, setFilterBy] = useState("form");
  // Single-open accordion: at most one form is expanded at a time. With
  // 200+ forms a multi-open list quickly becomes unscrollable; one card open
  // also keeps the bracket compute cost bounded.
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);

  const submittedForms = useMemo(() => {
    return Object.entries(allPredictions)
      .filter(([, formAny]) => normalizeStatus((formAny as any).status) === "submitted")
      .map(([formId, formAny]) => {
        const form = formAny as any;
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

  // If the user expanded a card and then filtered it out, drop the
  // expansion — otherwise an invisible drawer keeps the bracket compute
  // alive for a card the user can no longer see.
  useEffect(() => {
    if (!expandedFormId) return;
    if (!filteredForms.some((f) => f.formId === expandedFormId)) {
      setExpandedFormId(null);
    }
  }, [filteredForms, expandedFormId]);

  return (
    <div>
      <PageHeader
        title="כל הטפסים"
        subtitle={submittedForms.length > 0 ? `${submittedForms.length} טפסים הוגשו` : undefined}
        action={
          <div className="flex items-center gap-2">
            {expandedFormId && (
              <button
                onClick={() => setExpandedFormId(null)}
                className="btn-duo-flat"
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.8rem" }}
              >
                סגור הכל
              </button>
            )}
            <button
              onClick={onBack}
              className="btn-duo-flat"
              style={{ background: "var(--color-secondary)", color: "white", padding: "0.45rem 1rem" }}
            >
              חזרה
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {submittedForms.length === 0 ? (
        <EmptyState icon="📋" title="אף אחד עוד לא הגיש. הראשון קובע את הסטנדרט." />
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
                    className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition border-none cursor-pointer ${
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
              maxLength={50}
            />
          </div>

          <p className="text-sm text-ink-muted mb-3 font-bold">
            {filteredForms.length === submittedForms.length
              ? `${submittedForms.length} טפסים הוגשו • לחץ על טופס לצפייה`
              : `מציג ${filteredForms.length} מתוך ${submittedForms.length} טפסים`}
          </p>
          {!locked && (
            <div className="border-2 border-accent rounded-2xl p-4 mb-3 text-center" style={{ background: "var(--color-accent-soft)" }}>
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
                  expanded={expandedFormId === form.formId}
                  onToggle={() => setExpandedFormId((cur) => cur === form.formId ? null : form.formId)}
                />
              );
            })}
            {filteredForms.length === 0 && (
              <EmptyState icon="🔎" title="לא נמצאו טפסים תואמים" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
