import { useMemo } from "react";
import { ALL_TEAMS } from "../../data/teams";
import type { Chip, ChipKind } from "../../utils/adminQuery/types";

// Hebrew prefix letters that may glue to a team name (ב/ל/מ/ש/כ/ה/ו).
const PREFIXES = ["ב", "ל", "מ", "ש", "כ", "ה", "ו"];

// Static team-popularity prior (host nations + recent finalists rank higher).
// Used as a tie-breaker when two teams share a prefix-match length.
const POPULARITY_PRIOR: Record<string, number> = {
  ARG: 9, BRA: 9, FRA: 8, GER: 8, ENG: 8, ESP: 8, NED: 7, POR: 7,
  USA: 7, MEX: 7, CAN: 6, ITA: 5, BEL: 5, URU: 5, CRO: 5,
};

const STAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "groups", label: "שלב הבתים" },
  { code: "R32", label: "שלב ה-32" },
  { code: "R16", label: "שמינית גמר" },
  { code: "QF", label: "רבע גמר" },
  { code: "SF", label: "חצי גמר" },
  { code: "F", label: "גמר" },
];

interface Item {
  kind: ChipKind;
  code: string;
  label: string;
  score: number;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[֑-ׇ]/g, "") // strip niqud
    .replace(/[‎‏ ]/g, " ") // RLM/LRM/nbsp
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ץ/g, "צ")
    .replace(/ף/g, "פ")
    .replace(/ך/g, "כ")
    .toLowerCase();
}

function rank(query: string, label: string, code: string, prior: number): number {
  const nq = normalize(query);
  const nl = normalize(label);
  const nc = code.toLowerCase();
  if (!nq) return prior;
  if (nl.startsWith(nq) || nc.startsWith(nq)) return 1000 + nq.length * 10 + prior;
  if (nl.includes(nq) || nc.includes(nq)) return 500 + prior;
  return -1;
}

export function buildSuggestions(
  query: string,
  forms: { formId: string; formName: string; ownerName: string }[],
): Item[] {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  const tries = [q];
  if (q.length >= 2 && PREFIXES.includes(q[0])) tries.push(q.slice(1));

  const items: Item[] = [];
  for (const team of ALL_TEAMS as any[]) {
    let best = -1;
    for (const t of tries) {
      const r = rank(t, team.name, team.code, POPULARITY_PRIOR[team.code] || 0);
      if (r > best) best = r;
    }
    if (best > 0)
      items.push({ kind: "team", code: team.code, label: team.name, score: best });
  }
  for (const s of STAGE_OPTIONS) {
    const r = rank(q, s.label, s.code, 0);
    if (r > 0) items.push({ kind: "stage", code: s.code, label: s.label, score: r });
  }
  for (const f of forms) {
    const r = Math.max(rank(q, f.formName, f.formId, 0), rank(q, f.ownerName, "", 0));
    if (r > 0)
      items.push({
        kind: "form",
        code: f.formId,
        label: `${f.formName} (${f.ownerName})`,
        score: r,
      });
  }
  items.sort((a, b) => b.score - a.score);
  return items.slice(0, 8);
}

interface Props {
  query: string;
  forms: { formId: string; formName: string; ownerName: string }[];
  highlightedIndex: number;
  onPick: (chip: Chip) => void;
  onHover: (i: number) => void;
}

export default function AutocompleteDropdown({
  query,
  forms,
  highlightedIndex,
  onPick,
  onHover,
}: Props) {
  const items = useMemo(() => buildSuggestions(query, forms), [query, forms]);
  if (items.length === 0) return null;
  const KIND_LABEL: Record<ChipKind, string> = {
    team: "קבוצה",
    stage: "שלב",
    form: "טופס",
  };
  return (
    <div
      className="absolute z-30 mt-1 w-full max-h-64 overflow-auto bg-white border-2 border-border rounded-xl shadow-lg"
      role="listbox"
    >
      {items.map((it, i) => (
        <button
          key={`${it.kind}:${it.code}`}
          type="button"
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick({ kind: it.kind, code: it.code, label: it.label })}
          className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 cursor-pointer border-none ${
            i === highlightedIndex ? "bg-primary/10" : "bg-transparent"
          } hover:bg-primary/10`}
        >
          <span className="text-xs text-ink-muted bg-bg-soft rounded-md px-1.5 py-0.5">
            {KIND_LABEL[it.kind]}
          </span>
          <span className="font-extrabold text-ink">{it.label}</span>
          <span className="text-xs text-ink-muted ml-auto">{it.code}</span>
        </button>
      ))}
    </div>
  );
}
