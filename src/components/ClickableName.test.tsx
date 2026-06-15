import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClickableName from "./ClickableName";

describe("ClickableName", () => {
  it("renders a button with the given content and title", () => {
    render(<ClickableName onClick={() => {}} title="פרטי ברזיל">ברזיל</ClickableName>);
    const btn = screen.getByRole("button", { name: "ברזיל" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("title")).toBe("פרטי ברזיל");
  });

  it("fires onClick when tapped", () => {
    const onClick = vi.fn();
    render(<ClickableName onClick={onClick}>שם</ClickableName>);
    fireEvent.click(screen.getByRole("button", { name: "שם" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stops propagation so it wins inside a clickable parent", () => {
    const parentClick = vi.fn();
    const innerClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <ClickableName onClick={innerClick}>פנים</ClickableName>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "פנים" }));
    expect(innerClick).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });
});
