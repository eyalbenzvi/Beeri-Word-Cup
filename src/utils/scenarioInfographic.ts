/**
 * "התרחישים הסבירים ביותר" infographic — pure builders.
 *
 * Turns a Monte-Carlo ScenarioRunResult (scenarioSim.ts) into:
 *   1. selectLikelyScenarios — the likely finals (champion+runnerUp with
 *      prob > threshold) + the favorite FORM in each, with a top-N fallback
 *      when too few finals clear the bar, and the residual probability mass.
 *   2. buildInfographicSvg — a self-contained SVG string (brand-styled) used
 *      both as the on-screen preview and, rasterised, as the PNG export.
 *
 * Pure + side-effect-free → unit-testable and safe to call from render.
 * The SVG bakes brand HEX literals (an exported image can't resolve the CSS
 * vars in src/index.css) — they live in one BRAND constant below, mirroring
 * docs/brand-book.md.
 */

import type { ScenarioRunResult } from "./scenarioSim";
import { getTeamByCode } from "../data/teams";
import { FLAG_DATA_URIS } from "../data/flagAssets";

// ── brand tokens (mirror of docs/brand-book.md — see file header) ──
const BRAND = {
  primary: "#58CC02",
  primaryDark: "#46A302",
  primarySoft: "#F0FFE4",
  goldSoft: "#FFF3CC",
  secondary: "#1CB0F6",
  accent: "#FF9600",
  purple: "#CE82FF",
  danger: "#FF4B4B",
  gold: "#FFC800",
  silver: "#AFAFAF",
  bronze: "#CD7F32",
  ink: "#3C3C3C",
  inkMuted: "#5E5E5E",
  inkLight: "#737373",
  bg: "#FFFFFF",
  bgSoft: "#F7F7F7",
  border: "#E5E5E5",
  white: "#FFFFFF",
};

// Form pill colors — all chosen for legible WHITE text. Assigned in order of a
// form's first appearance as a favorite, so a form that wins several finals
// keeps ONE color across the whole graphic.
const FORM_COLORS = [
  BRAND.primary,
  BRAND.secondary,
  BRAND.purple,
  BRAND.accent,
  BRAND.danger,
  BRAND.primaryDark,
  "#1899D6",
  "#A568CC",
];

export type LikelyFinal = {
  rank: number; // 1-based display rank
  champion: string;
  runnerUp: string;
  prob: number; // P(this exact final) = scenario.prob
  samples: number;
  favoriteFormId: string;
  favoriteFormName: string;
  favoriteWinProb: number; // P(form finishes 1st | this final)
  favoriteIsMine: boolean;
  color: string; // pill color (stable per form)
};

export type LikelySelection = {
  finals: LikelyFinal[];
  residual: number; // 1 − Σ shown finals' prob (clamped ≥ 0)
  thresholdMet: boolean; // did ≥ minShown finals clear the threshold?
  threshold: number;
};

export type SelectOptions = {
  threshold?: number; // default 0.10 (>10%)
  minShown?: number; // fallback floor when too few clear the bar (default 3)
  maxShown?: number; // hard cap on rows (default 8)
  currentUserId?: string | null;
};

// Index of the form with the highest win probability in a scenario.
function favoriteIndex(winProb: number[]): number {
  let best = 0;
  for (let i = 1; i < winProb.length; i++) {
    if (winProb[i] > winProb[best]) best = i;
  }
  return best;
}

export function selectLikelyScenarios(
  run: ScenarioRunResult,
  opts: SelectOptions = {},
): LikelySelection {
  const threshold = opts.threshold ?? 0.1;
  const minShown = opts.minShown ?? 3;
  const maxShown = opts.maxShown ?? 8;
  const myId = opts.currentUserId ?? null;

  const byProb = [...run.scenarios].sort((a, b) => b.prob - a.prob);
  const passing = byProb.filter((s) => s.prob > threshold);
  const thresholdMet = passing.length > 0;
  // Show every final that clears the bar (respecting the ">threshold = likely"
  // definition). Only when NONE clear it — the common case, since champion+
  // runner-up pairs are spread thin — fall back to the top `minShown` so the
  // graphic is never empty. Always capped at maxShown.
  const chosen = (thresholdMet ? passing : byProb.slice(0, minShown)).slice(0, maxShown);

  // Assign a stable color per distinct favorite form (first-appearance order).
  const colorByForm = new Map<string, string>();
  const colorFor = (formId: string): string => {
    let c = colorByForm.get(formId);
    if (!c) {
      c = FORM_COLORS[colorByForm.size % FORM_COLORS.length];
      colorByForm.set(formId, c);
    }
    return c;
  };

  const finals: LikelyFinal[] = chosen.map((s, i) => {
    const fi = favoriteIndex(s.winProb);
    const favoriteFormId = run.formOrder[fi] ?? "";
    const info = run.forms[favoriteFormId];
    return {
      rank: i + 1,
      champion: s.champion,
      runnerUp: s.runnerUp,
      prob: s.prob,
      samples: s.samples,
      favoriteFormId,
      favoriteFormName: info?.formName || "טופס",
      favoriteWinProb: s.winProb[fi] ?? 0,
      favoriteIsMine: !!myId && info?.userId === myId,
      color: colorFor(favoriteFormId),
    };
  });

  const shownMass = finals.reduce((sum, f) => sum + f.prob, 0);
  const residual = Math.max(0, 1 - shownMass);

  return { finals, residual, thresholdMet, threshold };
}

// ── SVG builder ──
const W = 1080;
const PAD = 44;
const CP = 28; // inner card padding
const HEADER_H = 132;
const META_H = 56;
const ROW_H = 150;
const ROW_GAP = 18;
const FOOTER_H = 84;
const BLOCK_GAP = 24;
const FLAG_W = 44;
const FLAG_H = 30;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pct = (p: number) => `${Math.round(p * 100)}%`;
// Per-form win%: integer ≥1%, "<1%" for tiny nonzero, "—" for zero.
const winPct = (p: number) => (p <= 0 ? "—" : p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`);
const teamName = (code: string) => getTeamByCode(code)?.name || code;

// Rough text-width estimate (no canvas in a pure builder): enough to place a
// flag/dot next to a name without overlap. Hebrew/latin glyphs ≈ 0.58em,
// digits 0.55em, spaces 0.3em.
function approxWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 0.3;
    else if (ch >= "0" && ch <= "9") w += 0.55;
    else w += 0.58;
  }
  return w * fontSize;
}

// A flag <image> (base64 SVG data URI) + a thin outline so light flags read on
// white. Returns "" when no asset exists for the code (caller still shows name).
function flagImg(code: string, x: number, y: number): string {
  const uri = FLAG_DATA_URIS[code];
  if (!uri) return "";
  return `<image href="${uri}" x="${x}" y="${y}" width="${FLAG_W}" height="${FLAG_H}" preserveAspectRatio="xMidYMid slice"/><rect x="${x}" y="${y}" width="${FLAG_W}" height="${FLAG_H}" rx="4" fill="none" stroke="${BRAND.border}" stroke-width="1.5"/>`;
}

const FONT_HEAD = "Heebo, Rubik, 'Segoe UI', system-ui, sans-serif";
const FONT_BODY = "Rubik, Heebo, 'Segoe UI', system-ui, sans-serif";

// One scenario row (RTL). Tier 1 (the final): a left-side "X% מההרצות" chip,
// then — laid out from the right — the CHAMPION on a gold plate with a 🏆
// (the universal "this one won" cue), a "vs" pill, and the runner-up muted.
// A quiet grey rank number sits far right (gold is reserved for the champion).
// Tier 2 (the leading form): the form name (hero, right) with its win-% pill
// glued to its left and a short scenario-framed caption.
function renderRow(f: LikelyFinal, y: number): string {
  const L = PAD;
  const R = W - PAD;
  const innerW = R - L;
  const LL = L + CP;
  const RR = R - CP;

  // Quiet rank number (no medal colors — gold means "champion" here).
  const rcz = 36;
  const rcx = RR - rcz;
  const rcCx = rcx + rcz / 2;
  const rcCy = y + 18 + rcz / 2;

  // ── Tier 1: the final ──
  const my = y + 52; // name baseline
  const fy = y + 30; // flag top
  const nfs = 30;
  const champ = teamName(f.champion);
  const ru = teamName(f.runnerUp);

  // Champion block: [🏆][flag][name] on a gold plate, right→left.
  const trophyRight = rcx - 16;
  const champFlagX = trophyRight - 32 - FLAG_W;
  const champNameRight = champFlagX - 8;
  const champNameLeft = champNameRight - approxWidth(champ, nfs);
  const plateX = champNameLeft - 16;
  const plateRight = trophyRight + 8;

  // vs separator + runner-up block (muted), continuing left.
  const vsR = 17;
  const vsCx = plateX - 14 - vsR;
  const ruFlagX = vsCx - vsR - 14 - FLAG_W;
  const ruNameRight = ruFlagX - 8;

  // Final-probability chip (replaces the old bar) — far left of tier 1.
  const pcW = 132;
  const pcH = 48;
  const pcX = LL;
  const pcY = y + 16;

  // ── Tier 2: the leading form ──
  const subY = y + 122;
  const starW = f.favoriteIsMine ? 30 : 0;
  const nameRight2 = RR - starW;
  const name = f.favoriteFormName.length > 24 ? f.favoriteFormName.slice(0, 23) + "…" : f.favoriteFormName;
  const nameLeft2 = nameRight2 - approxWidth(name, 26);
  const winW = 84;
  const winH = 34;
  const winRight = nameLeft2 - 12;
  const winX = winRight - winW;
  const winY = subY - 25;
  const capRight = winX - 12;

  return `
  <g>
    <rect x="${L}" y="${y + 4}" width="${innerW}" height="${ROW_H}" rx="24" fill="${BRAND.border}" opacity="0.4"/>
    <rect x="${L}" y="${y}" width="${innerW}" height="${ROW_H}" rx="24" fill="${BRAND.bg}" stroke="${BRAND.border}" stroke-width="2"/>
    <circle cx="${rcCx}" cy="${rcCy}" r="${rcz / 2}" fill="${BRAND.bgSoft}"/>
    <text x="${rcCx}" y="${rcCy + 8}" font-family="${FONT_HEAD}" font-size="22" font-weight="800" fill="${BRAND.inkLight}" text-anchor="middle">${f.rank}</text>
    <rect x="${plateX}" y="${y + 22}" width="${plateRight - plateX}" height="44" rx="22" fill="${BRAND.goldSoft}"/>
    <text x="${trophyRight}" y="${my}" font-family="${FONT_BODY}" font-size="26" text-anchor="end">🏆</text>
    ${flagImg(f.champion, champFlagX, fy)}
    <text x="${champNameRight}" y="${my}" font-family="${FONT_HEAD}" font-size="${nfs}" font-weight="800" fill="${BRAND.ink}" text-anchor="start" direction="rtl">${esc(champ)}</text>
    <circle cx="${vsCx}" cy="${y + 44}" r="${vsR}" fill="${BRAND.bgSoft}"/>
    <text x="${vsCx}" y="${y + 49}" font-family="${FONT_BODY}" font-size="16" font-weight="700" fill="${BRAND.inkLight}" text-anchor="middle">vs</text>
    ${flagImg(f.runnerUp, ruFlagX, fy)}
    <text x="${ruNameRight}" y="${my}" font-family="${FONT_HEAD}" font-size="${nfs}" font-weight="700" fill="${BRAND.inkLight}" text-anchor="start" direction="rtl">${esc(ru)}</text>
    <rect x="${pcX}" y="${pcY}" width="${pcW}" height="${pcH}" rx="14" fill="${BRAND.primarySoft}"/>
    <text x="${pcX + pcW / 2}" y="${pcY + 24}" font-family="${FONT_HEAD}" font-size="24" font-weight="800" fill="${BRAND.primaryDark}" text-anchor="middle">${pct(f.prob)}</text>
    <text x="${pcX + pcW / 2}" y="${pcY + 40}" font-family="${FONT_BODY}" font-size="13" font-weight="700" fill="${BRAND.primaryDark}" text-anchor="middle" direction="rtl">מההרצות</text>
    ${f.favoriteIsMine ? `<text x="${RR}" y="${subY}" font-family="${FONT_BODY}" font-size="24" font-weight="800" fill="${BRAND.gold}" text-anchor="end">★</text>` : ""}
    <text x="${nameRight2}" y="${subY}" font-family="${FONT_HEAD}" font-size="26" font-weight="800" fill="${f.color}" text-anchor="start" direction="rtl">${esc(name)}</text>
    <rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" rx="${winH / 2}" fill="${f.color}"/>
    <text x="${winX + winW / 2}" y="${winY + 23}" font-family="${FONT_BODY}" font-size="20" font-weight="800" fill="${BRAND.white}" text-anchor="middle">${winPct(f.favoriteWinProb)}</text>
    <text x="${capRight}" y="${subY}" font-family="${FONT_BODY}" font-size="17" font-weight="700" fill="${BRAND.inkLight}" text-anchor="start" direction="rtl">מוביל בתרחיש</text>
  </g>`;
}

export function buildInfographicSvg(
  run: ScenarioRunResult,
  selection: LikelySelection,
  opts: { generatedAt?: number } = {},
): { svg: string; width: number; height: number } {
  const { finals } = selection;
  const n = finals.length;

  const rowsTop = HEADER_H + META_H + BLOCK_GAP;
  const rowsBlock = n > 0 ? n * ROW_H + (n - 1) * ROW_GAP : 0;
  const footerTop = rowsTop + rowsBlock + BLOCK_GAP;
  const H = footerTop + FOOTER_H;

  const generatedAt = opts.generatedAt ?? run.meta.generatedAt;
  const dateStr = new Date(generatedAt).toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Rows.
  let rows = "";
  let y = rowsTop;
  for (const f of finals) {
    rows += renderRow(f, y);
    y += ROW_H + ROW_GAP;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="${FONT_BODY}" style="display:block">
  <rect x="0" y="0" width="${W}" height="${H}" fill="${BRAND.bgSoft}"/>
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="${BRAND.primary}"/>
  <text x="${W / 2}" y="84" font-family="${FONT_HEAD}" font-size="50" font-weight="800" fill="${BRAND.white}" text-anchor="middle" direction="rtl">🏆 התרחישים הסבירים ביותר</text>
  <text x="${W / 2}" y="${HEADER_H + 36}" font-family="${FONT_BODY}" font-size="22" font-weight="700" fill="${BRAND.inkMuted}" text-anchor="middle" direction="rtl">מבוסס על ${run.meta.simCount.toLocaleString("he-IL")} הרצות · עודכן ${esc(dateStr)}</text>
  ${rows}
  <rect x="0" y="${footerTop}" width="${W}" height="${FOOTER_H}" fill="${BRAND.primaryDark}"/>
  <text x="${W / 2}" y="${footerTop + 50}" font-family="${FONT_HEAD}" font-size="30" font-weight="800" fill="${BRAND.white}" text-anchor="middle" direction="rtl">⚽ מונדיאל בארי 2026</text>
</svg>`;

  return { svg, width: W, height: H };
}

// Swap the responsive `width="100%"` for explicit pixel dimensions so the SVG
// rasterises at a known size (the on-screen preview keeps width="100%").
export function toFixedSizeSvg(svg: string, width: number, height: number): string {
  return svg.replace('width="100%"', `width="${width}" height="${height}"`);
}
