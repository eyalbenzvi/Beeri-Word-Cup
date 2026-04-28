import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Score from "./Score";

// Source-order is what makes this component correct in an RTL document.
// The contract: rendered output must contain `away` BEFORE `home` in DOM
// order, wrapped in <bdi> for bidi isolation. Tests below assert the
// contract via the rendered text + the surrounding HTML structure.

describe("Score", () => {
  it("wraps the pair in a <bdi> element for bidi isolation", () => {
    const { container } = render(<Score home={1} away={2} />);
    expect(container.querySelector("bdi")).toBeInTheDocument();
  });

  it("renders away BEFORE home in source/DOM order", () => {
    // 5 vs 0 are unambiguous — text content must read "0–5" (away then
    // home), not "5–0".
    const { container } = render(<Score home={5} away={0} />);
    expect(container.querySelector("bdi").textContent).toBe("0–5");
  });

  it("uses an en-dash (–) separator by default", () => {
    const { container } = render(<Score home={1} away={2} />);
    // En-dash is U+2013, not the ASCII hyphen.
    expect(container.querySelector("bdi").textContent).toBe("2–1");
  });

  it("respects a custom separator (e.g. ASCII hyphen)", () => {
    const { container } = render(<Score home={1} away={2} separator="-" />);
    expect(container.querySelector("bdi").textContent).toBe("2-1");
  });

  it('wraps in parens when wrap="parens"', () => {
    const { container } = render(
      <Score home={3} away={1} separator="-" wrap="parens" />,
    );
    expect(container.textContent).toBe("(1-3)");
    // The inner <bdi> still exists — parens are siblings, not inside it.
    expect(container.querySelector("bdi").textContent).toBe("1-3");
  });

  it("threads className through to the <bdi> element", () => {
    const { container } = render(
      <Score home={2} away={2} className="tabular-nums font-bold" />,
    );
    const bdi = container.querySelector("bdi");
    expect(bdi.className).toContain("tabular-nums");
    expect(bdi.className).toContain("font-bold");
  });

  it("handles 0-valued scores without coercing them to falsy display", () => {
    const { container } = render(<Score home={0} away={0} />);
    expect(container.querySelector("bdi").textContent).toBe("0–0");
  });

  it("handles double-digit scores (cap is 20 in MatchCard)", () => {
    const { container } = render(<Score home={12} away={9} />);
    expect(container.querySelector("bdi").textContent).toBe("9–12");
  });
});
