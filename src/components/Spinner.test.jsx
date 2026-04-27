import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Spinner from "./Spinner";

// First RTL component test in the project. Pattern to follow for new
// component tests: render → query by role/text → assert on accessible
// shape. Avoid querying by className unless the contract is purely
// visual; prefer the accessibility tree.

describe("Spinner", () => {
  it("renders with role=status for screen readers", () => {
    render(<Spinner />);
    // role="status" is what assistive tech listens to for "loading…".
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the visible label when provided", () => {
    render(<Spinner label="טוען..." />);
    expect(screen.getByRole("status")).toHaveTextContent("טוען...");
  });

  it("hides the spinning circle from assistive tech", () => {
    // The animated circle is decorative; only the label should be
    // announced. We assert the aria-hidden circle exists alongside
    // the role=status wrapper.
    const { container } = render(<Spinner label="x" />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).toBeInTheDocument();
  });

  it.each([
    ["sm", "w-3 h-3"],
    ["md", "w-5 h-5"],
    ["lg", "w-8 h-8"],
  ])('applies the correct size class for size="%s"', (size, expected) => {
    const { container } = render(<Spinner size={size} />);
    const circle = container.querySelector('[aria-hidden="true"]');
    expect(circle.className).toContain(expected);
  });

  it("falls back to medium size on unknown size prop", () => {
    const { container } = render(<Spinner size="enormous" />);
    const circle = container.querySelector('[aria-hidden="true"]');
    expect(circle.className).toContain("w-5 h-5");
  });

  it("threads through caller-provided className", () => {
    render(<Spinner className="custom-pad" label="x" />);
    const wrapper = screen.getByRole("status");
    expect(wrapper.className).toContain("custom-pad");
  });
});
