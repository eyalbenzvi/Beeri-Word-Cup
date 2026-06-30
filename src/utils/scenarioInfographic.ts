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
const CP = 26; // inner card padding
const HEADER_H = 200;
const META_H = 60;
const ROW_H = 172;
const ROW_GAP = 20;
const RESIDUAL_H = 96;
const FOOTER_H = 84;
const BLOCK_GAP = 24;
const FLAG_W = 42;
const FLAG_H = 28;

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

function rankColor(rank: number): { fill: string; text: string } {
  if (rank === 1) return { fill: BRAND.gold, text: BRAND.ink };
  if (rank === 2) return { fill: BRAND.silver, text: BRAND.white };
  if (rank === 3) return { fill: BRAND.bronze, text: BRAND.white };
  return { fill: BRAND.border, text: BRAND.inkMuted };
}

// One scenario row (RTL). Top: rank chip (far right) · champion flag+name · a
// "vs" pill · runner-up flag+name. Middle: probability bar (grows from the
// right; % attached to its tip). Bottom: a fixed-width win% chip on the left +
// the favorite form name (color-coded) on the right. `maxProb` scales the bar.
function renderRow(f: LikelyFinal, y: number, maxProb: number): string {
  const L = PAD;
  const R = W - PAD;
  const innerW = R - L;
  const LL = L + CP;
  const RR = R - CP;
  const rc = rankColor(f.rank);

  // Rank chip — rounded square at the top-right corner.
  const rcz = 48;
  const rcx = R - CP - rcz;
  const rcy = y + 22;

  // Matchup — laid out from the right, just left of the rank chip.
  const my = y + 50; // text baseline
  const fy = y + 28; // flag top (centred on the text)
  const fs = 30;
  const champ = teamName(f.champion);
  const champFlagX = rcx - 18 - FLAG_W;
  const champNameRight = champFlagX - 8;
  const champNameLeft = champNameRight - approxWidth(champ, fs);
  const vsR = 18;
  const vsCx = champNameLeft - 16 - vsR;
  const ru = teamName(f.runnerUp);
  const ruFlagX = vsCx - vsR - 16 - FLAG_W;
  const ruNameRight = ruFlagX - 8;

  // Probability bar (grows from the RIGHT).
  const barY = y + 88;
  const barH = 22;
  const trackW = innerW - 2 * CP;
  const fillW = Math.max(10, trackW * (f.prob / Math.max(maxProb, 0.0001)));
  const fillX = RR - fillW;
  const wide = fillW > 130;
  const pctTag = wide
    ? `<text x="${RR - 12}" y="${barY + barH - 5}" font-family="${FONT_BODY}" font-size="18" font-weight="800" fill="${BRAND.white}" text-anchor="end" direction="rtl">${pct(f.prob)} מהתרחישים</text>`
    : `<text x="${fillX - 10}" y="${barY + barH - 5}" font-family="${FONT_BODY}" font-size="18" font-weight="800" fill="${BRAND.primaryDark}" text-anchor="end" direction="rtl">${pct(f.prob)} מהתרחישים</text>`;

  // Favorite-form line.
  const subY = y + 145;
  const chipW = 104;
  const chipH = 34;
  const chipY = y + 126;
  const starW = f.favoriteIsMine ? 30 : 0;
  const nameRight = RR - starW;
  const nameLeft = nameRight - approxWidth(f.favoriteFormName, 26);

  return `
  <g>
    <rect x="${L}" y="${y + 4}" width="${innerW}" height="${ROW_H}" rx="24" fill="${BRAND.border}" opacity="0.45"/>
    <rect x="${L}" y="${y}" width="${innerW}" height="${ROW_H}" rx="24" fill="${BRAND.bg}" stroke="${BRAND.border}" stroke-width="2"/>
    <rect x="${rcx}" y="${rcy}" width="${rcz}" height="${rcz}" rx="14" fill="${rc.fill}"/>
    <text x="${rcx + rcz / 2}" y="${rcy + rcz / 2 + 11}" font-family="${FONT_HEAD}" font-size="30" font-weight="800" fill="${rc.text}" text-anchor="middle">${f.rank}</text>
    ${flagImg(f.champion, champFlagX, fy)}
    <text x="${champNameRight}" y="${my}" font-family="${FONT_HEAD}" font-size="${fs}" font-weight="800" fill="${BRAND.ink}" text-anchor="end" direction="rtl">${esc(champ)}</text>
    <circle cx="${vsCx}" cy="${y + 38}" r="${vsR}" fill="${BRAND.bgSoft}"/>
    <text x="${vsCx}" y="${y + 44}" font-family="${FONT_BODY}" font-size="17" font-weight="700" fill="${BRAND.inkLight}" text-anchor="middle">vs</text>
    ${flagImg(f.runnerUp, ruFlagX, fy)}
    <text x="${ruNameRight}" y="${my}" font-family="${FONT_HEAD}" font-size="${fs}" font-weight="800" fill="${BRAND.inkMuted}" text-anchor="end" direction="rtl">${esc(ru)}</text>
    <rect x="${LL}" y="${barY}" width="${trackW}" height="${barH}" rx="${barH / 2}" fill="${BRAND.bgSoft}"/>
    <rect x="${fillX}" y="${barY}" width="${fillW}" height="${barH}" rx="${barH / 2}" fill="${BRAND.primary}"/>
    ${pctTag}
    <rect x="${LL}" y="${chipY}" width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="${f.color}"/>
    <text x="${LL + chipW / 2}" y="${chipY + 23}" font-family="${FONT_BODY}" font-size="22" font-weight="800" fill="${BRAND.white}" text-anchor="middle">${winPct(f.favoriteWinProb)}</text>
    <text x="${LL + chipW + 12}" y="${subY}" font-family="${FONT_BODY}" font-size="16" font-weight="700" fill="${BRAND.inkLight}" text-anchor="start" direction="rtl">סיכוי הטופס לזכייה</text>
    <circle cx="${nameLeft - 14}" cy="${subY - 8}" r="7" fill="${f.color}"/>
    <text x="${nameRight}" y="${subY}" font-family="${FONT_HEAD}" font-size="26" font-weight="800" fill="${f.color}" text-anchor="end" direction="rtl">${esc(f.favoriteFormName)}</text>
    ${f.favoriteIsMine ? `<text x="${RR}" y="${subY}" font-family="${FONT_BODY}" font-size="26" font-weight="800" fill="${BRAND.gold}" text-anchor="end">★</text>` : ""}
  </g>`;
}

export function buildInfographicSvg(
  run: ScenarioRunResult,
  selection: LikelySelection,
  opts: { generatedAt?: number } = {},
): { svg: string; width: number; height: number } {
  const { finals, residual, thresholdMet, threshold } = selection;
  const n = finals.length;

  const rowsTop = HEADER_H + META_H + BLOCK_GAP;
  const rowsBlock = n > 0 ? n * ROW_H + (n - 1) * ROW_GAP : 0;
  const residualTop = rowsTop + rowsBlock + BLOCK_GAP;
  const footerTop = residualTop + RESIDUAL_H + BLOCK_GAP;
  const H = footerTop + FOOTER_H;

  const maxProb = finals.reduce((m, f) => Math.max(m, f.prob), 0.0001);

  const generatedAt = opts.generatedAt ?? run.meta.generatedAt;
  const dateStr = new Date(generatedAt).toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subtitle = thresholdMet
    ? `הגמרים עם יותר מ-${pct(threshold)} סיכוי · והטופס שמוביל בכל אחד`
    : `${pct(threshold)}+ סיכוי לא הושג עדיין — מוצגים ${n} הגמרים הסבירים ביותר`;

  // Rows.
  let rows = "";
  let y = rowsTop;
  for (const f of finals) {
    rows += renderRow(f, y, maxProb);
    y += ROW_H + ROW_GAP;
  }

  // Residual ("all other finals") bar — honesty about the long tail. Uses the
  // ABSOLUTE probability mass (not normalised), so it reads against the rows.
  const resLeft = PAD;
  const resW = W - 2 * PAD;
  const resBarY = residualTop + 52;
  const resBarH = 22;
  const resFillW = Math.max(10, resW * residual);
  const resFillX = W - PAD - resFillW;
  const resWide = resFillW > 130;

  const residualBlock = `
  <g>
    <text x="${W - PAD}" y="${residualTop + 36}" font-family="${FONT_HEAD}" font-size="26" font-weight="800" fill="${BRAND.inkMuted}" text-anchor="end" direction="rtl">כל שאר התרחישים</text>
    <rect x="${resLeft}" y="${resBarY}" width="${resW}" height="${resBarH}" rx="${resBarH / 2}" fill="${BRAND.bgSoft}"/>
    <rect x="${resFillX}" y="${resBarY}" width="${resFillW}" height="${resBarH}" rx="${resBarH / 2}" fill="${BRAND.silver}"/>
    ${
      resWide
        ? `<text x="${W - PAD - 12}" y="${resBarY + resBarH - 5}" font-family="${FONT_BODY}" font-size="18" font-weight="800" fill="${BRAND.white}" text-anchor="end">${pct(residual)}</text>`
        : `<text x="${resFillX - 10}" y="${resBarY + resBarH - 5}" font-family="${FONT_BODY}" font-size="18" font-weight="800" fill="${BRAND.inkMuted}" text-anchor="end">${pct(residual)}</text>`
    }
  </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="${FONT_BODY}" style="display:block">
  <rect x="0" y="0" width="${W}" height="${H}" fill="${BRAND.bgSoft}"/>
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="${BRAND.primary}"/>
  <text x="${W / 2}" y="90" font-family="${FONT_HEAD}" font-size="54" font-weight="800" fill="${BRAND.white}" text-anchor="middle" direction="rtl">🏆 התרחישים הסבירים ביותר</text>
  <text x="${W / 2}" y="142" font-family="${FONT_BODY}" font-size="27" font-weight="700" fill="${BRAND.white}" text-anchor="middle" direction="rtl" opacity="0.92">${esc(subtitle)}</text>
  <text x="${W / 2}" y="${HEADER_H + 38}" font-family="${FONT_BODY}" font-size="22" font-weight="700" fill="${BRAND.inkMuted}" text-anchor="middle" direction="rtl">מבוסס על ${run.meta.simCount.toLocaleString("he-IL")} הרצות · עודכן ${esc(dateStr)}</text>
  ${rows}
  ${residualBlock}
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
