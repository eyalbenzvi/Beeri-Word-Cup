import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MatchConsensusLine from "./MatchConsensusLine";

describe("MatchConsensusLine", () => {
  it("renders nothing when there are no predictions", () => {
    const { container } = render(<MatchConsensusLine consensus={undefined} />);
    expect(container.textContent).toBe("");
    const { container: c2 } = render(
      <MatchConsensusLine consensus={{ preds: 0, homeWin: 0, draw: 0, awayWin: 0, topHome: null, topAway: null, topCount: 0 }} />,
    );
    expect(c2.textContent).toBe("");
  });

  it("shows the dominant outcome symbol, its percentage and the prediction count", () => {
    const { container } = render(
      <MatchConsensusLine
        consensus={{ preds: 4, homeWin: 3, draw: 1, awayWin: 0, topHome: 2, topAway: 1, topCount: 2 }}
      />,
    );
    const text = container.textContent || "";
    // 3/4 home wins → dominant "1" at 75%.
    expect(text).toContain("1 75%");
    expect(text).toContain("4 ניחושים");
  });

  it("does not render the most-common score when none exists", () => {
    const { container } = render(
      <MatchConsensusLine
        consensus={{ preds: 2, homeWin: 0, draw: 2, awayWin: 0, topHome: null, topAway: null, topCount: 0 }}
      />,
    );
    expect(container.textContent).toContain("X 100%");
    expect(container.textContent).not.toContain("נפוצה");
  });
});
