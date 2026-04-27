/**
 * Cross-validation: Compare our bracket.js logic with the Excel calculator
 *
 * Usage:
 * 1. Run the Google Apps Script (tests/google-apps-script-compare.js) in Google Sheets
 * 2. Save the JSON output to tests/excel-comparison-data.json
 * 3. Run: node tests/test-compare-with-excel.mjs
 *
 * Or for self-test mode (no Excel needed):
 *   node tests/test-compare-with-excel.mjs --self-test
 */

import { readFileSync, existsSync } from "fs";
import { GROUPS } from "/home/user/Beeri-World-Cup/src/data/teams.js";
import {
  groupMatches,
  R32_MATCHES,
} from "/home/user/Beeri-World-Cup/src/data/matches.js";
import {
  calcGroupStandings,
  calcBracketTeams,
} from "/home/user/Beeri-World-Cup/src/utils/bracket.js";

// ====== Team Name Mapping: Excel name → our code ======
const EXCEL_NAME_TO_CODE = {
  Mexico: "MEX",
  "South Africa": "RSA",
  "Rep. of Korea": "KOR",
  "Czech Rep.": "CZE",
  Canada: "CAN",
  "Bosnia/Herzeg.": "BIH",
  Qatar: "QAT",
  Switzerland: "SUI",
  Brazil: "BRA",
  Morocco: "MAR",
  Haiti: "HAI",
  Scotland: "SCO",
  USA: "USA",
  Paraguay: "PAR",
  Australia: "AUS",
  Turkey: "TUR",
  Germany: "GER",
  Curaçao: "CUR",
  "Ivory Coast": "CIV",
  Ecuador: "ECU",
  Netherlands: "NED",
  Japan: "JPN",
  Sweden: "SWE",
  Tunisia: "TUN",
  Belgium: "BEL",
  Egypt: "EGY",
  "IR Iran": "IRN",
  "New Zealand": "NZL",
  Spain: "ESP",
  "Cape Verde": "CPV",
  "Saudi Arabia": "KSA",
  Uruguay: "URU",
  France: "FRA",
  Senegal: "SEN",
  Iraq: "IRQ",
  Norway: "NOR",
  Argentina: "ARG",
  Algeria: "ALG",
  Austria: "AUT",
  Jordan: "JOR",
  Portugal: "POR",
  "DR Congo": "COD",
  Uzbekistan: "UZB",
  Colombia: "COL",
  England: "ENG",
  Croatia: "CRO",
  Ghana: "GHA",
  Panama: "PAN",
};

const CODE_TO_EXCEL_NAME = {};
for (const [name, code] of Object.entries(EXCEL_NAME_TO_CODE)) {
  CODE_TO_EXCEL_NAME[code] = name;
}

// ====== Test Framework ======
let passed = 0,
  failed = 0;
const failures = [];
function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error("  FAIL: " + message);
  }
}

// ====== Build match lookup ======
// Map: "CODE1-CODE2" → match object (sorted alphabetically so order doesn't matter)
function matchKey(code1, code2) {
  return [code1, code2].sort().join("-");
}

const groupMatchByTeamPair = {};
for (const m of groupMatches) {
  const key = matchKey(m.homeTeam, m.awayTeam);
  groupMatchByTeamPair[key] = m;
}

// ====== FIFA match number to R32 ID mapping ======
const R32_BY_FIFA = {};
for (const m of R32_MATCHES) {
  R32_BY_FIFA[m.fifaMatch] = m;
}

// ====== Main comparison ======
function compareWithExcel(excelData) {
  console.log("=== EXCEL CROSS-VALIDATION: Bracket Logic Comparison ===\n");
  console.log(`Excel data timestamp: ${excelData.timestamp}\n`);

  // ---- Step 1: Build match predictions from Excel scores ----
  console.log("--- 1. Mapping Excel match scores to our match IDs ---");
  const matchPredictions = {};
  let mappedMatches = 0;
  let unmappedMatches = 0;

  for (const match of excelData.matchScores) {
    const homeCode = EXCEL_NAME_TO_CODE[match.homeTeam];
    const awayCode = EXCEL_NAME_TO_CODE[match.awayTeam];

    if (!homeCode || !awayCode) {
      console.error(
        `  WARNING: Unknown team name: "${match.homeTeam}" or "${match.awayTeam}"`,
      );
      unmappedMatches++;
      continue;
    }

    const key = matchKey(homeCode, awayCode);
    const ourMatch = groupMatchByTeamPair[key];

    if (!ourMatch) {
      console.error(
        `  WARNING: No match found for ${homeCode} vs ${awayCode} in group ${match.group}`,
      );
      unmappedMatches++;
      continue;
    }

    // Important: set scores relative to OUR home/away, not Excel's
    // Since group matches have fixed home/away, we need to check if the teams are flipped
    if (ourMatch.homeTeam === homeCode) {
      matchPredictions[ourMatch.id] = {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      };
    } else {
      // Teams are swapped relative to our data - flip scores
      matchPredictions[ourMatch.id] = {
        homeScore: match.awayScore,
        awayScore: match.homeScore,
      };
    }
    mappedMatches++;
  }

  console.log(`  Mapped: ${mappedMatches}, Unmapped: ${unmappedMatches}`);
  assert(mappedMatches === 72, `All 72 matches mapped (got ${mappedMatches})`);

  // ---- Step 2: Calculate our standings ----
  console.log("\n--- 2. Comparing group standings ---");
  const ourStandings = calcGroupStandings(matchPredictions);

  let standingsMatch = 0;
  let standingsMismatch = 0;

  for (const group of Object.keys(GROUPS)) {
    const excelGroup = excelData.detailedStandings?.[group] || excelData.standings?.[group];
    if (!excelGroup) {
      console.error(`  No Excel data for group ${group}`);
      continue;
    }

    const ourGroup = ourStandings[group];
    if (!ourGroup) {
      console.error(`  No standings for group ${group}`);
      continue;
    }

    for (let pos = 0; pos < 4; pos++) {
      const excelTeamName = excelGroup[pos]?.team;
      const excelCode = EXCEL_NAME_TO_CODE[excelTeamName];
      const ourCode = ourGroup[pos]?.code;

      if (excelCode === ourCode) {
        standingsMatch++;
      } else {
        standingsMismatch++;
        // Show detailed info for debugging
        const ourTeamInfo = ourGroup[pos];
        const excelInfo = excelGroup[pos];
        console.error(
          `  Group ${group}, Position ${pos + 1}: ` +
            `Excel="${excelTeamName}" (${excelCode}), ` +
            `Ours="${ourTeamInfo?.code}" ` +
            `[Excel: pts=${excelInfo?.pts}, gd=${excelInfo?.gd}, gf=${excelInfo?.gf}] ` +
            `[Ours: pts=${ourTeamInfo?.pts}, gd=${ourTeamInfo?.gd}, gf=${ourTeamInfo?.gf}]`,
        );
      }
    }
  }

  console.log(
    `  Standings: ${standingsMatch}/48 positions match, ${standingsMismatch} mismatches`,
  );
  assert(
    standingsMismatch === 0,
    `All group standings match (${standingsMismatch} mismatches)`,
  );

  // ---- Step 3: Compare R32 teams ----
  console.log("\n--- 3. Comparing Round of 32 teams ---");
  const bracketTeams = calcBracketTeams(matchPredictions);

  let r32Match = 0;
  let r32Mismatch = 0;

  for (const excelR32 of excelData.r32Matches) {
    const r32Def = R32_BY_FIFA[excelR32.fifaMatch];
    if (!r32Def) {
      console.error(
        `  WARNING: No R32 match definition for FIFA ${excelR32.fifaMatch}`,
      );
      continue;
    }

    const ourR32 = bracketTeams[r32Def.id];
    if (!ourR32) {
      console.error(`  WARNING: No bracket teams for ${r32Def.id}`);
      continue;
    }

    const excelHomeCode = EXCEL_NAME_TO_CODE[excelR32.homeTeam];
    const excelAwayCode = EXCEL_NAME_TO_CODE[excelR32.awayTeam];

    // Compare home team
    if (excelHomeCode === ourR32.home) {
      r32Match++;
    } else {
      r32Mismatch++;
      console.error(
        `  ${r32Def.id} (FIFA ${excelR32.fifaMatch}) HOME: ` +
          `Excel="${excelR32.homeTeam}" (${excelHomeCode}), ` +
          `Ours="${ourR32.home}" (${CODE_TO_EXCEL_NAME[ourR32.home] || "?"})`,
      );
    }

    // Compare away team
    if (excelAwayCode === ourR32.away) {
      r32Match++;
    } else {
      r32Mismatch++;
      console.error(
        `  ${r32Def.id} (FIFA ${excelR32.fifaMatch}) AWAY: ` +
          `Excel="${excelR32.awayTeam}" (${excelAwayCode}), ` +
          `Ours="${ourR32.away}" (${CODE_TO_EXCEL_NAME[ourR32.away] || "?"})`,
      );
    }
  }

  console.log(
    `  R32 teams: ${r32Match}/32 match, ${r32Mismatch} mismatches`,
  );
  assert(
    r32Mismatch === 0,
    `All R32 teams match (${r32Mismatch} mismatches)`,
  );

  // ---- Step 4: Compare qualifying third-place teams ----
  console.log("\n--- 4. Comparing qualifying third-place teams ---");
  if (excelData.thirdPlaceTeams && excelData.thirdPlaceTeams.length > 0) {
    const excelQualifying3rd = excelData.thirdPlaceTeams
      .slice(0, 8)
      .map((t) => EXCEL_NAME_TO_CODE[t.team])
      .filter(Boolean)
      .sort();

    // Our qualifying 3rd: collect all teams that appear in R32 away slots
    // where the R32 match has away="3rd"
    const ourQualifying3rd = [];
    for (const m of R32_MATCHES) {
      if (m.away === "3rd") {
        const bracket = bracketTeams[m.id];
        if (bracket?.away) {
          ourQualifying3rd.push(bracket.away);
        }
      }
    }
    ourQualifying3rd.sort();

    const excelSet = new Set(excelQualifying3rd);
    const ourSet = new Set(ourQualifying3rd);

    let third3Match = 0;
    for (const code of excelQualifying3rd) {
      if (ourSet.has(code)) {
        third3Match++;
      } else {
        console.error(
          `  Excel has qualifying 3rd: ${code} (${CODE_TO_EXCEL_NAME[code]}), ours doesn't`,
        );
      }
    }
    for (const code of ourQualifying3rd) {
      if (!excelSet.has(code)) {
        console.error(
          `  Ours has qualifying 3rd: ${code} (${CODE_TO_EXCEL_NAME[code]}), Excel doesn't`,
        );
      }
    }

    console.log(
      `  Qualifying 3rd: ${third3Match}/8 match (Excel: [${excelQualifying3rd.join(",")}], Ours: [${ourQualifying3rd.join(",")}])`,
    );
    assert(
      third3Match === 8 &&
        excelQualifying3rd.length === 8 &&
        ourQualifying3rd.length === 8,
      `All 8 qualifying third-place teams match`,
    );
  } else {
    console.log("  (No third-place data in Excel output)");
  }

  // ---- Summary ----
  console.log(
    `\n=== RESULTS: ${passed} passed, ${failed} failed ===`,
  );
  if (failures.length) {
    console.log("\nFAILURES:");
    failures.forEach((f) => console.log("  - " + f));
  }

  return { passed, failed, failures };
}

// ====== Self-test mode: generate random scores without Excel ======
function selfTest() {
  console.log("=== SELF-TEST MODE: Generating random scores locally ===\n");

  // Random score generator (same weights as the website)
  function randomScore() {
    const weights = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
    return weights[Math.floor(Math.random() * weights.length)];
  }

  // Generate random scores for all 72 group matches
  const matchPredictions = {};
  for (const m of groupMatches) {
    matchPredictions[m.id] = {
      homeScore: randomScore(),
      awayScore: randomScore(),
    };
  }

  // Compute standings
  const standings = calcGroupStandings(matchPredictions);
  const bracketTeams = calcBracketTeams(matchPredictions);

  console.log("Group Standings:");
  for (const [group, teams] of Object.entries(standings)) {
    const line = teams
      .map(
        (t, i) =>
          `${i + 1}.${t.code}(${t.pts}pts,${t.gf}-${t.ga})`,
      )
      .join(" ");
    console.log(`  ${group}: ${line}`);
  }

  console.log("\nR32 Matchups:");
  for (const m of R32_MATCHES) {
    const teams = bracketTeams[m.id];
    if (teams) {
      const homeName = CODE_TO_EXCEL_NAME[teams.home] || teams.home || "?";
      const awayName = CODE_TO_EXCEL_NAME[teams.away] || teams.away || "?";
      console.log(
        `  ${m.id} (FIFA ${m.fifaMatch}): ${homeName} vs ${awayName}`,
      );
    }
  }

  // Build fake Excel data for self-comparison
  const excelData = {
    timestamp: new Date().toISOString(),
    matchScores: groupMatches.map((m) => ({
      group: m.group,
      matchSlot: 0,
      homeTeam: CODE_TO_EXCEL_NAME[m.homeTeam],
      awayTeam: CODE_TO_EXCEL_NAME[m.awayTeam],
      homeScore: matchPredictions[m.id].homeScore,
      awayScore: matchPredictions[m.id].awayScore,
    })),
    detailedStandings: {},
    thirdPlaceTeams: [],
    r32Matches: [],
  };

  // Fill standings
  for (const [group, teams] of Object.entries(standings)) {
    excelData.detailedStandings[group] = teams.map((t, i) => ({
      position: i + 1,
      team: CODE_TO_EXCEL_NAME[t.code],
      pts: t.pts,
      gf: t.gf,
      ga: t.ga,
      gd: t.gd,
    }));
  }

  // Fill R32
  for (const m of R32_MATCHES) {
    const teams = bracketTeams[m.id];
    excelData.r32Matches.push({
      fifaMatch: m.fifaMatch,
      homeTeam: CODE_TO_EXCEL_NAME[teams?.home] || "",
      awayTeam: CODE_TO_EXCEL_NAME[teams?.away] || "",
    });
  }

  // Fill third place
  // Collect 3rd place teams from standings
  const thirdPlaceAll = [];
  for (const [group, teams] of Object.entries(standings)) {
    if (teams[2]) {
      thirdPlaceAll.push({
        team: CODE_TO_EXCEL_NAME[teams[2].code],
        group: group,
        pts: teams[2].pts,
        gd: teams[2].gd,
        gf: teams[2].gf,
      });
    }
  }
  thirdPlaceAll.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return 0;
  });
  excelData.thirdPlaceTeams = thirdPlaceAll.slice(0, 8).map((t, i) => ({
    rank: i + 1,
    team: t.team,
    group: t.group,
  }));

  console.log("\n--- Running self-comparison (should be 100% match) ---\n");
  return compareWithExcel(excelData);
}

// ====== Entry point ======
const args = process.argv.slice(2);

if (args.includes("--self-test")) {
  const result = selfTest();
  process.exit(result.failed > 0 ? 1 : 0);
} else {
  const jsonPath =
    args[0] || "/home/user/Beeri-World-Cup/tests/excel-comparison-data.json";

  if (!existsSync(jsonPath)) {
    console.log("No Excel comparison data found at: " + jsonPath);
    console.log("");
    console.log("Options:");
    console.log(
      "  1. Run the Google Apps Script and save output to: " + jsonPath,
    );
    console.log("  2. Run self-test: node tests/test-compare-with-excel.mjs --self-test");
    console.log("");
    console.log("Running self-test instead...\n");
    const result = selfTest();
    process.exit(result.failed > 0 ? 1 : 0);
  } else {
    const raw = readFileSync(jsonPath, "utf8");
    const excelData = JSON.parse(raw);
    const result = compareWithExcel(excelData);
    process.exit(result.failed > 0 ? 1 : 0);
  }
}
