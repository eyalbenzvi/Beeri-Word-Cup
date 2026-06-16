import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OfflineBanner from "./OfflineBanner";

// Helper: drive navigator.onLine + fire the matching window event the way a
// real browser would on a connectivity transition.
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

describe("OfflineBanner", () => {
  afterEach(() => {
    // Restore the jsdom default (online) so tests don't leak state.
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("renders nothing while online", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an accessible status message when offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<OfflineBanner />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("אין חיבור לאינטרנט");
  });

  it("appears on `offline` and disappears on `online`", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setOnline(false);
    expect(screen.getByRole("status")).toBeInTheDocument();

    setOnline(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("removes its window listeners on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain("online");
    expect(events).toContain("offline");
    remove.mockRestore();
  });
});
