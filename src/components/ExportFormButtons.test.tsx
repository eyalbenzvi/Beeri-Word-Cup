import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExportFormButtons from "./ExportFormButtons";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("./Toast", () => ({
  useToast: () => vi.fn(),
}));

const mockExportToExcel = vi.fn().mockResolvedValue(undefined);

vi.mock("../utils/exportFormExcel", () => ({
  exportToExcel: mockExportToExcel,
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

  it("renders one button (Excel only)", () => {
    render(<ExportFormButtons form={makeForm()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(screen.getByText("Excel")).toBeInTheDocument();
  });

  it("Excel button has correct aria-label initially", () => {
    render(<ExportFormButtons form={makeForm()} />);
    expect(
      screen.getByRole("button", { name: /הורד קובץ אקסל/i }),
    ).toBeInTheDocument();
  });

  it("calls exportToExcel when Excel button is clicked", async () => {
    render(<ExportFormButtons form={makeForm()} />);
    fireEvent.click(screen.getByText("Excel"));
    await waitFor(() => {
      expect(mockExportToExcel).toHaveBeenCalledTimes(1);
    });
  });

  it("button is disabled while download is in progress", async () => {
    let resolveExcel!: () => void;
    mockExportToExcel.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveExcel = res;
      }),
    );

    render(<ExportFormButtons form={makeForm()} />);
    fireEvent.click(screen.getByText("Excel"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
    });

    resolveExcel();
    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
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
    fireEvent.click(excelBtn);
    fireEvent.click(excelBtn);

    resolveExcel();
    await waitFor(() => {
      expect(mockExportToExcel).toHaveBeenCalledTimes(1);
    });
  });

  it("uses compact button style when compact=true", () => {
    const { container } = render(
      <ExportFormButtons form={makeForm()} compact={true} />,
    );
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

describe("Export buttons gating — draft forms", () => {
  it("ExportFormButtons itself always renders (gating is in the parent)", () => {
    render(<ExportFormButtons form={makeForm({ status: "draft" })} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
