// Single-source RTL-correct score renderer.
//
// Background — why source order matters in this RTL UI:
// In a Hebrew RTL document, digit sub-runs render LTR within their bidi
// context. With JSX written as `{home}-{away}`, the home digit ends up
// visually on the LEFT, while the home team name (the first flex child)
// appears on the RIGHT. Hebrew readers reading right-to-left then
// interpret the right-hand number as the home score — scores look
// reversed.
//
// Putting `away` FIRST in source flips the visual layout so the right
// edge of the score block carries the home digit, next to the home team
// name. We wrap the whole thing in <bdi> to isolate the digit-pair from
// the surrounding bidi context (otherwise a multi-digit score like
// "10–2" can re-arrange across the dash).
//
// Use this component anywhere a "home – away" score is rendered. The
// previous inline pattern was duplicated across 6+ files and a
// static-audit suite (test-bidi-scores.mjs) had to lock down every
// usage by string-match.
//
// Props:
//   home, away   — the score numbers (or strings; rendered verbatim)
//   separator    — character between digits. Defaults to en-dash (–);
//                  pass "-" for the regular hyphen used in some places.
//   wrap         — "parens" renders "({away}–{home})". Used on the
//                  Leaderboard's per-prediction inline summary.
//   className    — passed through to the <bdi> for visual tweaks
//                  (tabular-nums, font-bold, etc.).
export default function Score({
  home,
  away,
  separator = "–", // en-dash
  wrap,
  className,
}) {
  const inner = (
    <bdi className={className}>
      {away}
      {separator}
      {home}
    </bdi>
  );
  if (wrap === "parens") {
    return <>({inner})</>;
  }
  return inner;
}
