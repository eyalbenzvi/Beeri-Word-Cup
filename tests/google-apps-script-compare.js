/**
 * Google Apps Script for World Cup Excel Cross-Validation
 *
 * HOW TO USE:
 * 1. Open the Google Sheet with the World Cup Excel
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire code
 * 4. Run the function: fillRandomAndCompare()
 * 5. Copy the JSON output from the dialog/logs
 * 6. Save it to tests/excel-comparison-data.json
 * 7. Run: node tests/test-compare-with-excel.mjs
 *
 * To clear scores: run clearAllScores()
 */

// ====== CONFIGURATION ======

// Score rows in the "World Cup" sheet (where scores are entered)
const SCORE_ROWS = [14, 19, 24, 29, 34, 39];
// Team name rows (above each score row)
const TEAM_ROWS = [13, 18, 23, 28, 33, 38];

// First column (1-indexed) for each group's pair of columns in "World Cup" sheet
const GROUP_COLS = {
  A: 2,  // B,C
  B: 5,  // E,F
  C: 8,  // H,I
  D: 11, // K,L
  E: 14, // N,O
  F: 17, // Q,R
  G: 20, // T,U
  H: 23, // W,X
  I: 26, // Z,AA
  J: 29, // AC,AD
  K: 32, // AF,AG
  L: 35  // AI,AJ
};

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// ====== MAIN FUNCTIONS ======

function fillRandomAndCompare() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wc = ss.getSheetByName('World Cup');
  const matchesSheet = ss.getSheetByName('Matches');

  // Random score generator (weighted distribution like the website)
  function randomScore() {
    const weights = [0,0,0,1,1,1,1,1,2,2,2,2,3,3,4,5];
    return weights[Math.floor(Math.random() * weights.length)];
  }

  // ---- Step 1: Generate and write random scores ----
  const matchScores = [];

  for (const group of GROUPS) {
    const startCol = GROUP_COLS[group];

    // Read all team names for this group (batch read)
    const teamNames = [];
    for (let i = 0; i < 6; i++) {
      const homeTeam = wc.getRange(TEAM_ROWS[i], startCol).getValue();
      const awayTeam = wc.getRange(TEAM_ROWS[i], startCol + 1).getValue();
      teamNames.push({ home: homeTeam, away: awayTeam });
    }

    // Generate and write scores
    for (let i = 0; i < 6; i++) {
      const homeScore = randomScore();
      const awayScore = randomScore();

      wc.getRange(SCORE_ROWS[i], startCol).setValue(homeScore);
      wc.getRange(SCORE_ROWS[i], startCol + 1).setValue(awayScore);

      matchScores.push({
        group: group,
        matchSlot: i + 1,
        homeTeam: teamNames[i].home,
        awayTeam: teamNames[i].away,
        homeScore: homeScore,
        awayScore: awayScore
      });
    }
  }

  // Force recalculation
  SpreadsheetApp.flush();
  // Small delay to ensure formulas finish
  Utilities.sleep(2000);
  SpreadsheetApp.flush();

  // ---- Step 2: Read group standings (rows 42-45) ----
  const standings = {};

  for (const group of GROUPS) {
    const startCol = GROUP_COLS[group];
    standings[group] = [];

    for (let pos = 0; pos < 4; pos++) {
      const row = 42 + pos;
      const teamName = wc.getRange(row, startCol).getValue();
      const statsStr = wc.getRange(row, startCol + 1).getValue();
      standings[group].push({
        position: pos + 1,
        team: teamName || '',
        stats: statsStr || ''
      });
    }
  }

  // ---- Step 3: Read third-place teams ----
  // Third place info is in columns AL-AN, rows 42 onwards
  // AL42 = 1st qualifying third, AN42 = group
  const thirdPlaceTeams = [];
  for (let i = 0; i < 12; i++) {
    const row = 42 + i;
    const teamName = wc.getRange(row, 38).getValue(); // AL column = 38
    const groupLetter = wc.getRange(row, 40).getValue(); // AN column = 40
    if (teamName && teamName !== '') {
      thirdPlaceTeams.push({
        rank: i + 1,
        team: teamName,
        group: groupLetter
      });
    }
  }

  // ---- Step 4: Read R32 matchups from Matches sheet ----
  // Matches sheet rows 77-92 have the R32 matches
  const r32Matches = [];
  for (let row = 77; row <= 92; row++) {
    const matchNo = matchesSheet.getRange(row, 2).getValue(); // B = match number
    const posHome = matchesSheet.getRange(row, 3).getValue(); // C = home position code
    const posAway = matchesSheet.getRange(row, 4).getValue(); // D = away position code
    const teamHome = matchesSheet.getRange(row, 9).getValue(); // I = home team name
    const teamAway = matchesSheet.getRange(row, 10).getValue(); // J = away team name

    r32Matches.push({
      fifaMatch: matchNo,
      homePosition: posHome,
      awayPosition: posAway,
      homeTeam: teamHome || '',
      awayTeam: teamAway || ''
    });
  }

  // ---- Step 5: Read CalcX detailed standings for debugging ----
  const detailedStandings = {};
  for (const group of GROUPS) {
    const calcSheet = ss.getSheetByName('Calc' + group);
    if (!calcSheet) continue;

    detailedStandings[group] = [];
    // Rows 5-8 have the raw stats, rows 22-25 have the sorted order
    for (let i = 0; i < 4; i++) {
      const row = 22 + i;
      const teamName = calcSheet.getRange(row, 4).getValue(); // D column
      const pts = calcSheet.getRange(row, 5).getValue(); // E column (Pts after sorting)
      const gf = calcSheet.getRange(row, 6).getValue(); // F column
      const ga = calcSheet.getRange(row, 7).getValue(); // G column

      detailedStandings[group].push({
        position: i + 1,
        team: teamName || '',
        pts: pts || 0,
        gf: gf || 0,
        ga: ga || 0,
        gd: (gf || 0) - (ga || 0)
      });
    }
  }

  // ---- Build output ----
  const output = {
    timestamp: new Date().toISOString(),
    matchScores: matchScores,
    standings: standings,
    detailedStandings: detailedStandings,
    thirdPlaceTeams: thirdPlaceTeams,
    r32Matches: r32Matches
  };

  const jsonStr = JSON.stringify(output, null, 2);

  // Log it
  Logger.log(jsonStr);

  // Show in a dialog for easy copying (truncated if too long)
  const ui = SpreadsheetApp.getUi();
  if (jsonStr.length > 40000) {
    // Too long for dialog, use a sidebar or just log
    ui.alert(
      'Output is in the logs (View → Logs)',
      'JSON is too long for dialog (' + jsonStr.length + ' chars). Check Apps Script logs.',
      ui.ButtonSet.OK
    );
  } else {
    // Create an HTML dialog with a copyable text area
    const html = HtmlService.createHtmlOutput(
      '<textarea id="json" style="width:100%;height:400px;font-size:11px;">' +
      jsonStr.replace(/</g, '&lt;') +
      '</textarea>' +
      '<br><button onclick="navigator.clipboard.writeText(document.getElementById(\'json\').value);' +
      'document.getElementById(\'status\').textContent=\'Copied!\'">Copy to Clipboard</button>' +
      '<span id="status" style="margin-left:10px;color:green;"></span>'
    ).setWidth(800).setHeight(500).setTitle('Excel Comparison Data');
    ui.showModalDialog(html, 'Excel Comparison Data - Copy this JSON');
  }

  return output;
}

/**
 * Clear all scores from the World Cup sheet
 */
function clearAllScores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wc = ss.getSheetByName('World Cup');

  for (const group of GROUPS) {
    const startCol = GROUP_COLS[group];
    for (let i = 0; i < 6; i++) {
      wc.getRange(SCORE_ROWS[i], startCol).setValue('');
      wc.getRange(SCORE_ROWS[i], startCol + 1).setValue('');
    }
  }

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('All scores cleared!');
}

/**
 * Run multiple iterations and collect only mismatches
 * (For advanced use - requires the Node.js script to output expected results)
 */
function runMultipleIterations() {
  const iterations = 5;
  const allResults = [];

  for (let i = 0; i < iterations; i++) {
    Logger.log('Running iteration ' + (i + 1) + '/' + iterations);
    const result = fillRandomAndCompare();
    allResults.push(result);
    Utilities.sleep(1000);
  }

  Logger.log('All ' + iterations + ' iterations complete');
  Logger.log(JSON.stringify(allResults, null, 2));
}
