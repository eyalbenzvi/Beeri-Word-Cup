import { describe, it, expect } from "vitest";
import { buildAllFormsWorkbook, unwrapDirectory } from "./exportAllFormsExcel";
import { groupMatches, ALL_MATCHES } from "../data/matches";
import { getTeamByCode } from "../data/teams";

// The builder is pure (no xlsx, no DOM) — these tests assert the workbook
// structure the one-off scripts/export-all-forms.ts script writes out.

const firstMatch = groupMatches[0]; // group-A-1

function makeForm(overrides: Record<string, any> = {}) {
  return {
    formName: "טופס בדיקה",
    status: "submitted",
    userId: "uid1",
    submittedAt: Date.UTC(2026, 5, 1),
    topScorer: "קיליאן אמבפה",
    budgetNumber: "42",
    matches: { [firstMatch.id]: { homeScore: 2, awayScore: 1 } },
    ...overrides,
  };
}

const directory = {
  uid1: { displayName: "אייל" },
  uid2: { firstName: "דנה", lastName: "לוי" },
};

describe("buildAllFormsWorkbook", () => {
  it("produces the four sheets in order", () => {
    const sheets = buildAllFormsWorkbook({ "uid1__1": makeForm() }, directory);
    expect(sheets.map((s) => s.name)).toEqual([
      "סיכום",
      "שלב הבתים",
      "נוקאאוט",
      "נתונים גולמיים",
    ]);
  });

  it("includes only submitted forms (approved normalizes to submitted, drafts excluded)", () => {
    const sheets = buildAllFormsWorkbook(
      {
        "uid1__1": makeForm({ formName: "א" }),
        "uid1__2": makeForm({ formName: "ב", status: "draft" }),
        "uid2__1": makeForm({ formName: "ג", status: "approved", userId: "uid2" }),
      },
      directory,
    );
    const summary = sheets[0].rows;
    // header + 2 forms (draft excluded)
    expect(summary).toHaveLength(3);
    expect(summary.map((r) => r[0])).toEqual(["שם טופס", "א", "ג"]);
  });

  it("summary row carries owner, top scorer, budget number and filled count", () => {
    const sheets = buildAllFormsWorkbook({ "uid1__1": makeForm() }, directory);
    const row = sheets[0].rows[1];
    expect(row[1]).toBe("אייל");
    expect(row[4]).toBe("קיליאן אמבפה");
    expect(row[5]).toBe("42");
    expect(row[6]).toBe(`1/${ALL_MATCHES.length}`);
  });

  it("falls back to firstName+lastName, then 'משתמש', for owner name", () => {
    const sheets = buildAllFormsWorkbook(
      {
        "uid2__1": makeForm({ formName: "א", userId: "uid2" }),
        "unknown__1": makeForm({ formName: "ב", userId: "unknown" }),
      },
      directory,
    );
    expect(sheets[0].rows[1][1]).toBe("דנה לוי");
    expect(sheets[0].rows[2][1]).toBe("משתמש");
  });

  it("group matrix has form-name and owner header rows, one column per form", () => {
    const sheets = buildAllFormsWorkbook(
      {
        "uid1__1": makeForm({ formName: "א" }),
        "uid2__1": makeForm({ formName: "ב", userId: "uid2" }),
      },
      directory,
    );
    const rows = sheets[1].rows;
    expect(rows[0].slice(4)).toEqual(["א", "ב"]);
    expect(rows[1].slice(4)).toEqual(["אייל", "דנה לוי"]);
    expect(sheets[1].cols).toHaveLength(4 + 2);
  });

  it("renders a prediction as h:a in the group matrix and — when missing", () => {
    const sheets = buildAllFormsWorkbook({ "uid1__1": makeForm() }, directory);
    const rows = sheets[1].rows;
    // First match row sits right after the two header rows.
    const matchRow = rows[2];
    expect(matchRow[2]).toBe(getTeamByCode(firstMatch.homeTeam)?.name);
    expect(matchRow[4]).toBe("2:1");
    // Some other group-A match the form did not predict.
    expect(rows[3][4]).toBe("—");
  });

  it("knockout matrix shows the form's bracket teams without a score prediction", () => {
    const sheets = buildAllFormsWorkbook({ "uid1__1": makeForm() }, directory);
    const koRows = sheets[2].rows;
    // The bracket resolves matchups from partial group predictions, but with
    // no KO score predicted the cell is just "<home> — <away>".
    expect(koRows[2][3]).toContain(" — ");
    expect(koRows[0].slice(3)).toEqual(["טופס בדיקה"]);
  });

  it("raw sheet has one row per form × match", () => {
    const sheets = buildAllFormsWorkbook(
      {
        "uid1__1": makeForm({ formName: "א" }),
        "uid2__1": makeForm({ formName: "ב", userId: "uid2" }),
      },
      directory,
    );
    expect(sheets[3].rows).toHaveLength(1 + 2 * ALL_MATCHES.length);
  });

  it("unwraps the userDirectory `data` envelope (real Firestore doc shape)", () => {
    // The live gameData/userDirectory doc is { data: { uid: {...} } } —
    // without unwrapping, every owner silently falls back to "משתמש".
    expect(unwrapDirectory({ data: directory })).toEqual(directory);
    expect(unwrapDirectory(directory)).toEqual(directory);
    expect(unwrapDirectory(null)).toEqual({});
    const sheets = buildAllFormsWorkbook(
      { "uid1__1": makeForm() },
      unwrapDirectory({ data: directory }),
    );
    expect(sheets[0].rows[1][1]).toBe("אייל");
  });

  it("sorts forms by name", () => {
    const sheets = buildAllFormsWorkbook(
      {
        "uid1__1": makeForm({ formName: "בבב" }),
        "uid1__2": makeForm({ formName: "אאא" }),
      },
      directory,
    );
    expect(sheets[0].rows.slice(1).map((r) => r[0])).toEqual(["אאא", "בבב"]);
  });
});
