// Scenario infographic builders — selectLikelyScenarios + buildInfographicSvg.
//
// Locks the contract the admin "likely finals" infographic depends on:
//   1. >threshold filter picks the right finals, sorted by probability.
//   2. Fallback to top-N when too few finals clear the bar (the common case —
//      champion+runner-up pairs are spread thin).
//   3. Favorite form per scenario = the form with the highest win probability.
//   4. Residual mass = 1 − Σ shown finals' prob.
//   5. The SVG embeds the favorite form NAMES + team labels + a per-final %, so
//      a refactor that drops them is caught here (no false-pass).

import {
  selectLikelyScenarios,
  buildInfographicSvg,
  toFixedSizeSvg,
} from '/home/user/Beeri-World-Cup/src/utils/scenarioInfographic.js';

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error('  FAIL: ' + m); } }

console.log('=== SCENARIO INFOGRAPHIC TESTS ===\n');

// Synthetic run: 3 forms, 3 finals with descending probability. Win-prob
// arrays are aligned to formOrder; the max index is the intended favorite.
const run = {
  meta: { seed: 1, simCount: 200000, generatedAt: 1700000000000, formCount: 3, minScenarioSamples: 100 },
  formOrder: ['fA', 'fB', 'fC'],
  forms: {
    fA: { userId: 'uA', formName: 'נבחרת אלון' },
    fB: { userId: 'uB', formName: 'הניחושים של דנה' },
    fC: { userId: 'uC', formName: 'טופס גמר' },
  },
  champions: [
    { code: 'BRA', prob: 0.3, samples: 60000 },
    { code: 'ESP', prob: 0.25, samples: 50000 },
  ],
  scenarios: [
    // BRA beats ESP — 14% — fB favorite (0.5 > 0.3 > 0.2)
    { champion: 'BRA', runnerUp: 'ESP', prob: 0.14, samples: 28000, avgRank: [2, 1, 3], avgPoints: [80, 90, 70], winProb: [0.3, 0.5, 0.2] },
    // ESP beats BRA — 11% — fA favorite (0.6)
    { champion: 'ESP', runnerUp: 'BRA', prob: 0.11, samples: 22000, avgRank: [1, 2, 3], avgPoints: [95, 85, 60], winProb: [0.6, 0.3, 0.1] },
    // BRA beats GER — 6% — fB favorite (below 10% threshold)
    { champion: 'BRA', runnerUp: 'GER', prob: 0.06, samples: 12000, avgRank: [2, 1, 3], avgPoints: [70, 88, 65], winProb: [0.25, 0.55, 0.2] },
  ],
};

// 1. Threshold filter + ordering.
const sel = selectLikelyScenarios(run, { threshold: 0.1, currentUserId: 'uA' });
assert(sel.thresholdMet === true, 'two finals clear 10% → thresholdMet');
assert(sel.finals.length === 2, `>10% yields 2 finals (got ${sel.finals.length})`);
assert(sel.finals[0].champion === 'BRA' && sel.finals[0].runnerUp === 'ESP', 'finals sorted by prob desc');
assert(sel.finals[0].rank === 1 && sel.finals[1].rank === 2, 'ranks are 1-based in order');

// 2. Favorite form = max winProb.
assert(sel.finals[0].favoriteFormId === 'fB', `BRA>ESP favorite is fB (got ${sel.finals[0].favoriteFormId})`);
assert(sel.finals[0].favoriteFormName === 'הניחושים של דנה', 'favorite form name resolved');
assert(Math.abs(sel.finals[0].favoriteWinProb - 0.5) < 1e-9, 'favorite win prob carried through');
assert(sel.finals[1].favoriteFormId === 'fA', `ESP>BRA favorite is fA (got ${sel.finals[1].favoriteFormId})`);
assert(sel.finals[1].favoriteIsMine === true, 'currentUser uA owns fA → favoriteIsMine');
assert(sel.finals[0].favoriteIsMine === false, 'fB not owned by current user');

// 3. Residual = 1 − Σ shown.
assert(Math.abs(sel.residual - (1 - 0.14 - 0.11)) < 1e-9, `residual = 0.75 (got ${sel.residual})`);

// 4. Stable color per form (here all distinct, so all differ).
assert(sel.finals[0].color !== sel.finals[1].color, 'distinct favorite forms get distinct colors');

// 5. Fallback when none clear the bar.
const selHigh = selectLikelyScenarios(run, { threshold: 0.5, minShown: 3 });
assert(selHigh.thresholdMet === false, 'no final >50% → thresholdMet false');
assert(selHigh.finals.length === 3, `fallback shows top-3 (got ${selHigh.finals.length})`);
assert(selHigh.finals[0].prob >= selHigh.finals[1].prob && selHigh.finals[1].prob >= selHigh.finals[2].prob, 'fallback still prob-sorted');

// 6. SVG embeds names, team labels, percentages, and brand chrome.
const { svg, width, height } = buildInfographicSvg(run, sel);
assert(width === 1080 && height > 0, `svg has dimensions (got ${width}x${height})`);
assert(svg.includes('הניחושים של דנה') && svg.includes('נבחרת אלון'), 'svg embeds favorite form names');
assert(svg.includes('ברזיל') && svg.includes('ספרד'), 'svg embeds team labels (he names)');
assert(svg.includes('14%') && svg.includes('11%'), 'svg embeds per-final probabilities');
assert(svg.includes('כל שאר התרחישים') && svg.includes('75%'), 'svg embeds residual bar + value');
assert(svg.includes('התרחישים הסבירים ביותר'), 'svg embeds title');
assert(svg.includes('width="100%"'), 'preview svg is responsive (width=100%)');

// 7. Fixed-size swap for rasterisation.
const fixed = toFixedSizeSvg(svg, width, height);
assert(fixed.includes(`width="${width}"`) && fixed.includes(`height="${height}"`), 'export svg gets explicit px dimensions');
assert(!fixed.includes('width="100%"'), 'export svg no longer responsive');

// 8. XML escaping — a form name with special chars must not break the SVG.
const runEsc = {
  ...run,
  forms: { ...run.forms, fB: { userId: 'uB', formName: 'A & B <test>' } },
};
const selEsc = selectLikelyScenarios(runEsc, { threshold: 0.1 });
const { svg: svgEsc } = buildInfographicSvg(runEsc, selEsc);
assert(svgEsc.includes('A &amp; B &lt;test&gt;'), 'special chars in form name are XML-escaped');
assert(!svgEsc.includes('A & B <test>'), 'raw unescaped name is not present');

// 9. Empty run → empty selection, valid (zero-row) SVG.
const emptyRun = { ...run, scenarios: [] };
const selEmpty = selectLikelyScenarios(emptyRun, { threshold: 0.1 });
assert(selEmpty.finals.length === 0, 'no scenarios → no finals');
const { svg: svgEmpty } = buildInfographicSvg(emptyRun, selEmpty);
assert(typeof svgEmpty === 'string' && svgEmpty.includes('<svg'), 'empty run still builds a valid svg');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
