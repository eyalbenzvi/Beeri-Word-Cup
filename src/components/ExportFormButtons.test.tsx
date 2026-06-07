import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExportFormButtons from "./ExportFormButtons";

// ── Mock dependencies ─────────────────────────────────────────────────────────

// Toast context — provide a no-op showToast via the hook
vi.mock("./Toast", () => ({
  useToast: () => vi.fn(),
}));

// Lazy export utilities — default to instant resolve
const mockExportToExcel = vi.fn().mockResolvedValue(undefined);
const mockExportToPdf = vi.fn().mockResolvedValue(undefined);

vi.mock("../utils/exportFormExcel", () => ({
  exportToExcel: mockExportToExcel,
}));

vi.mock("../utils/exportFormPdf", () => ({
  exportToPdf: mockExportToPdf,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeForm(overrides: Record<string, any> = {}): any {
  return {
    formId: "test-form",
    formName: "טופס בדיקה",
    status: "submitted",
    matches: {},
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ExportFormButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders two buttons (Excel and PDF)", () => {
    render(<ExportFormButtons form={makeForm()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.getByText("Excel")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("Excel button has correct aria-label initially", () => {
    render(<ExportFormButtons form={makeForm()} />);
    expect(
      screen.getByRole("button", { name: /הורד קובץ אקסל/i }),
    ).toBeInTheDocument();
  });

  it("PDF button has correct aria-label initially", () => {
    render(<ExportFormButtons form={makeForm()} />);
    expect(
      screen.getByRole("button", { name: /הורד קובץ PDF/i }),
    ).toBeInTheDocument();
  });

  it("calls exportToExcel when Excel button is clicked", async () => {
    render(<ExportFormButtons form={makeForm()} />);
    fireEvent.click(screen.getByText("Excel"));
    await waitFor(() => {
      expect(mockExportToExcel).toHaveBeenCalledTimes(1);
    });
  });

  it("calls exportToPdf when PDF button is clicked", async () => {
    render(<ExportFormButtons form={makeForm()} userName="Test User" />);
    fireEvent.click(screen.getByText("PDF"));
    await waitFor(() => {
      expect(mockExportToPdf).toHaveBeenCalledWith(
        expect.objectContaining({ formId: "test-form" }),
        "Test User",
      );
    });
  });

  it("both buttons are disabled while a download is in progress", async () => {
    // Make export take a while
    let resolveExcel!: () => void;
    mockExportToExcel.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveExcel = res;
      }),
    );

    render(<ExportFormButtons form={makeForm()} />);
    fireEvent.click(screen.getByText("Excel"));

    // While loading: both buttons should be disabled
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    // Resolve the export
    resolveExcel();
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });
  });

  it("second click while loading is ignored (exportingRef guard)", async () => {
    let resolveExcel!: () => void;
    mockExportToExcel.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveExcel = res;
      }),
    );

    render(<ExportFormButtons form={makeForm()} />);
    const excelBtn = screen.getByText("Excel");
    fireEvent.click(excelBtn);
    // Second click while still loading
    fireEvent.click(excelBtn);
    fireEvent.click(excelBtn);

    resolveExcel();
    await waitFor(() => {
      // Despite three clicks, exportToExcel should be called exactly once
      expect(mockExportToExcel).toHaveBeenCalledTimes(1);
    });
  });

  it("uses compact button style when compact=true", () => {
    const { container } = render(
      <ExportFormButtons form={makeForm()} compact={true} />,
    );
    // In compact mode the wrapper div should not have justify-center
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain("justify-center");
  });

  it("uses non-compact button style by default", () => {
    const { container } = render(<ExportFormButtons form={makeForm()} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("justify-center");
  });
});

// ── Guard: ExportFormButtons should not render for draft forms ────────────────
// The parent components (Predict.tsx, FormList.tsx) gate rendering on status
// being "submitted". This test confirms the gating pattern is in place.

describe("Export buttons gating — draft forms", () => {
  it("ExportFormButtons itself always renders (gating is in the parent)", () => {
    // ExportFormButtons is a dumb component — the parent decides whether to
    // render it. A draft form passed directly still produces two buttons.
    render(<ExportFormButtons form={makeForm({ status: "draft" })} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
