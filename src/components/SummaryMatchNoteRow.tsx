import { useMemo } from "react";
import { Sparkles, Plus } from "lucide-react";
import { BLOG } from "../constants/messages";
import { getMatchById, STAGES } from "../data/matches";
import { getTeamByCode } from "../data/teams";
import { computeMatchStats } from "../utils/summaryStats";
import { getMatchSuggestions } from "../utils/statStarters";

// Extracted from SummaryEditor.jsx (PR3, audit #32). Keeps the long
// score-stats + suggestion-chips + textarea + AI-draft block out of the
// 800-line editor body. Three small helpers ride along since they're
// only used by this row:
//   - teamLabel: flag + name display
//   - appendSuggestion: shared text-append helper (also used by the
//     global suggestion panel back in SummaryEditor; re-exported)
//   - MatchSuggestionPanel: the per-match chip strip

export function teamLabel(code) {
  const t = getTeamByCode(code);
  return t ? `${t.flag} ${t.name}` : code || "—";
}

// Append a suggestion text onto an existing field, separated by a blank
// line so the result reads as a new paragraph. Empty existing → just the
// suggestion. Used by both per-match and global piquancy chips.
export function appendSuggestion(existing, addition) {
  const trimmed = (existing || "").trim();
  if (!trimmed) return addition;
  return `${trimmed}\n\n${addition}`;
}

// Per-match suggestion chips. Quiet by design — small label, no big
// buttons. Click prepends to that match's note.
function MatchSuggestionPanel({ suggestions, onInsert }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="flex items-center flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onInsert(s.text)}
            title={s.text}
            aria-label={BLOG.editor.suggestionInsertAria(s.text)}
            className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-primary-soft text-primary-dark border-2 border-primary/30 hover:border-primary px-2 py-1 rounded-full cursor-pointer transition truncate max-w-[260px]"
          >
            <Plus size={12} className="flex-shrink-0" />
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Per-match editor row. Isolated so that a keystroke in one row doesn't
// re-run computeMatchStats across every row — stats memoize on
// (matchId, result, allPredictions, users).
export default function SummaryMatchNoteRow({
  mid,
  matchResults,
  allPredictions,
  users,
  value,
  onChange,
  onAskAI,
  aiLoading,
  aiDisabled,
}) {
  const m = getMatchById(mid);
  const r = matchResults[mid];
  const stats = useMemo(
    () => computeMatchStats({ matchId: mid, result: r, allPredictions, users }),
    [mid, r, allPredictions, users],
  );
  // Piquancy chips for THIS match — same memo deps as stats since they're
  // a derivative of it.
  const suggestions = useMemo(
    () => (m && r ? getMatchSuggestions({ match: m, result: r, allPredictions, users }) : []),
    [m, r, allPredictions, users],
  );
  if (!m) return null;
  return (
    <div className="border-2 border-border rounded-2xl p-3 bg-bg-soft/40">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="text-sm font-extrabold text-ink">
          {teamLabel(m.homeTeam)} {r ? `${r.homeScore}–${r.awayScore}` : "–"} {teamLabel(m.awayTeam)}
        </span>
        <span className="text-[11px] font-bold text-ink-muted">
          {STAGES[m.stage] || m.stage} · {stats.exactHitCount}/{stats.totalForms} מדויקים
        </span>
      </div>
      <MatchSuggestionPanel
        suggestions={suggestions}
        onInsert={(text) => onChange(appendSuggestion(value, text))}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full p-2 border-2 border-border rounded-xl text-sm leading-relaxed"
        placeholder={BLOG.editor.placeholderMatchNote}
        maxLength={5000}
      />
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={onAskAI}
          disabled={aiDisabled}
          className="btn-duo btn-duo-ghost-raised btn-duo-sm flex items-center gap-1"
          aria-label={BLOG.editor.aiDraftMatch}
        >
          <Sparkles size={14} />
          <span>{aiLoading ? BLOG.editor.aiThinking : BLOG.editor.aiDraftMatch}</span>
        </button>
      </div>
    </div>
  );
}
