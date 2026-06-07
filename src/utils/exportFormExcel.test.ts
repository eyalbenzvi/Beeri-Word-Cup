import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared mock form fixtures ─────────────────────────────────────────────────

function makeMinimalForm(overrides: Record<string, any> = {}): any {
  return {
    formId: "test-form-id",
    formName: "טופס בדיקה",
    budgetNumber: "500",
    topScorer: "Lionel Messi",
    submittedAt: 1718000000000,
    status: "submitted",
    matches: {
      // Provide a few group predictions so bracket has something to work with
      "group-A-1": { homeScore: 2, awayScore: 1 },
      "group-A-2": { homeScore: 0, awayScore: 0 },
    },
    ...overrides,
  };
}

// ── Mock xlsx ─────────────────────────────────────────────────────────────────
// We intercept the dynamic import of 'xlsx' inside exportToExcel.

let capturedWorkbook: any = null;
let capturedFileName: string | null = null;
let appendSheetCalls: Array<{ name: string; data: any[][] }> = [];

vi.mock("xlsx", () => {
  const aoa_to_sheet = vi.fn((data: any[][]) => ({ __data: data, "!cols": undefined }));
  const book_new = vi.fn(() => ({
    Props: {},
    Sheets: {},
    SheetNames: [],
    Workbook: undefined,
  }));
  const book_append_sheet = vi.fn((wb: any, ws: any, name: string) => {
    appendSheetCalls.push({ name, data: ws.__data || [] });
    if (!wb.SheetNames) wb.SheetNames = [];
    wb.SheetNames.push(name);
    if (!wb.Sheets) wb.Sheets = {};
    wb.Sheets[name] = ws;
  });
  const writeFile = vi.fn((wb: any, fileName: string) => {
    capturedWorkbook = wb;
    capturedFileName = fileName;
  });

  return {
    utils: { aoa_to_sheet, book_new, book_append_sheet },
    writeFile,
  };
});

// Also mock the dynamic import path (Vite resolves it from the same module)
vi.mock("../utils/exportFormExcel", async (importOriginal) => {
  // Let the real module load — it will pick up the mocked xlsx via vi.mock above
  return importOriginal();
});

describe("exportToExcel — sheet creation", () => {
  beforeEach(() => {
    capturedWorkbook = null;
    capturedFileName = null;
    appendSheetCalls = [];
  });

  it("resolves without throwing for a valid submitted form", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await expect(exportToExcel(makeMinimalForm())).resolves.not.toThrow();
  });

  it("creates exactly 5 sheets", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm());
    expect(appendSheetCalls).toHaveLength(5);
  });

  it("names the sheets correctly", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm());
    const names = appendSheetCalls.map((c) => c.name);
    expect(names).toContain("פרטי טופס");
    expect(names).toContain("שלב הבתים");
    expect(names).toContain("שלב ההמשך");
    expect(names).toContain("טבלאות הבתים (חיזוי)");
    expect(names).toContain("מפתח ניקוד");
  });

  it("writes a file with formId in the filename", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm({ formId: "abc123" }));
    expect(capturedFileName).toContain("abc123");
    expect(capturedFileName).toMatch(/\.xlsx$/);
  });

  it("handles null homeScore/awayScore without throwing", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    const form = makeMinimalForm({
      matches: {
        "group-A-1": { homeScore: null, awayScore: null },
        "group-A-2": { homeScore: null, awayScore: 2 },
        "group-A-3": {},
      },
    });
    await expect(exportToExcel(form)).resolves.not.toThrow();
  });

  it("handles null submittedAt without throwing", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    const form = makeMinimalForm({ submittedAt: null });
    await expect(exportToExcel(form)).resolves.not.toThrow();
  });

  it("handles form with status 'approved' (treated same as submitted)", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    // exportToExcel doesn't gate on status — it just exports whatever is passed.
    const form = makeMinimalForm({ status: "approved" });
    await expect(exportToExcel(form)).resolves.not.toThrow();
  });

  it("handles completely empty matches without throwing", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    const form = makeMinimalForm({ matches: {} });
    await expect(exportToExcel(form)).resolves.not.toThrow();
  });

  it("sets RTL at workbook level", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm());
    expect(capturedWorkbook?.Workbook?.Views?.[0]?.RTL).toBe(true);
  });

  it("sheet 2 (שלב הבתים) contains 72 group match data rows plus separators", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm());
    const groupSheet = appendSheetCalls.find((c) => c.name === "שלב הבתים");
    expect(groupSheet).toBeDefined();
    // 72 matches + 1 header + 11 separator rows (between 12 groups) = 84 rows
    // Each group has 6 matches. 12 groups. 11 separators between them.
    const dataRows = groupSheet!.data;
    // Header row is the first
    expect(dataRows[0][0]).toBe("בית");
    // Count match rows (those that start with "בית ...")
    const matchRows = dataRows.filter(
      (r: any[]) => typeof r[0] === "string" && r[0].startsWith("בית "),
    );
    expect(matchRows.length).toBe(72);
  });

  it("includes the champion name in sheet 1 when no predictions are made", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    await exportToExcel(makeMinimalForm({ matches: {} }));
    const formSheet = appendSheetCalls.find((c) => c.name === "פרטי טופס");
    expect(formSheet).toBeDefined();
    // Row 4 is 'אלופה'
    const champRow = formSheet!.data.find((r: any[]) => r[0] === "אלופה");
    expect(champRow).toBeDefined();
    expect(champRow![1]).toBe("לא נקבע");
  });

  it("uses fallback filename when formId is missing", async () => {
    const { exportToExcel } = await import("./exportFormExcel");
    const form = makeMinimalForm({ formId: undefined });
    await exportToExcel(form);
    expect(capturedFileName).toContain("form");
  });
});

// ── normalizeStatus integration guard ────────────────────────────────────────

describe("normalizeStatus — export feature dependency", () => {
  it('maps "approved" → "submitted" (used to gate export button visibility)', async () => {
    const { normalizeStatus } = await import("./helpers");
    expect(normalizeStatus("approved")).toBe("submitted");
    expect(normalizeStatus("submitted")).toBe("submitted");
    expect(normalizeStatus("draft")).toBe("draft");
    expect(normalizeStatus(undefined)).toBe("draft");
  });
});
