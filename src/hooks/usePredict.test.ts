import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { usePredictPosition, usePredictDuplicateNameView } from "./usePredict";
import { NavigationProvider } from "./useNavigation";

// usePredictPosition is URL-driven through the navigation context — it must
// render under a NavigationProvider, exactly like in the app.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(NavigationProvider, null, children);

describe("usePredictPosition", () => {
  beforeEach(() => {
    sessionStorage.clear();
    // The hook writes ?stage=…&group=… via history — reset between tests so
    // one test's URL residue can't win over the next test's bootstrap.
    window.history.replaceState({}, "", "/");
  });
  afterEach(() => sessionStorage.clear());

  it("returns sane defaults when no saved state exists", () => {
    const { result } = renderHook(() => usePredictPosition("formA"), { wrapper });
    const [stage, , group] = result.current;
    expect(stage).toBe("group");
    expect(group).toBe("A");
  });

  it("persists changes to sessionStorage keyed by activeFormId", () => {
    const { result } = renderHook(() => usePredictPosition("formA"), { wrapper });
    const [, setStage, , setGroup] = result.current;
    act(() => {
      setStage("R32");
      setGroup("B");
    });
    const saved = JSON.parse(sessionStorage.getItem("predict-pos-formA"));
    expect(saved.stage).toBe("R32");
    expect(saved.group).toBe("B");
  });

  it("restores state from sessionStorage on mount", () => {
    sessionStorage.setItem(
      "predict-pos-formX",
      JSON.stringify({ stage: "QF", group: "C" }),
    );
    const { result } = renderHook(() => usePredictPosition("formX"), { wrapper });
    // The bootstrap effect patches the URL params (replace), which re-renders
    // the provider — after mount the state reflects the saved values.
    const [stage, , group] = result.current;
    expect(stage).toBe("QF");
    expect(group).toBe("C");
  });

  it("ignores malformed saved JSON without throwing", () => {
    sessionStorage.setItem("predict-pos-formY", "not-json{");
    const { result } = renderHook(() => usePredictPosition("formY"), { wrapper });
    // Defaults survive the malformed restore.
    expect(result.current[0]).toBe("group");
    expect(result.current[2]).toBe("A");
  });

  it("does nothing when activeFormId is null", () => {
    const { result } = renderHook(() => usePredictPosition(null), { wrapper });
    const [, setStage] = result.current;
    act(() => setStage("R16"));
    // No persisted entry created.
    expect(sessionStorage.length).toBe(0);
  });
});

describe("usePredictDuplicateNameView", () => {
  it("filters to submitted/approved/pending forms only", () => {
    const all = {
      f1: { status: "draft", formName: "Draft" },
      f2: { status: "submitted", formName: "Sub" },
      f3: { status: "approved", formName: "App" },
      f4: { status: "pending", formName: "Pen" },
      f5: { status: "rejected", formName: "Rej" },
    };
    const { result } = renderHook(() => usePredictDuplicateNameView(all));
    expect(Object.keys(result.current).sort()).toEqual(["f2", "f3", "f4"]);
  });

  it("projects to only formName + status (drops sensitive fields)", () => {
    const all = {
      f1: {
        status: "submitted",
        formName: "X",
        matches: { large: "object" },
        userId: "phone_05X",
      },
    };
    const { result } = renderHook(() => usePredictDuplicateNameView(all));
    expect(Object.keys(result.current.f1).sort()).toEqual(["formName", "status"]);
  });

  it("returns the SAME reference when source map changes by an unrelated edit", () => {
    // Critical perf invariant: a score change on a DIFFERENT user's form
    // must not bust this view's identity, otherwise the entire validate
    // chain re-runs on every keystroke tournament-wide.
    const all1 = { f1: { status: "submitted", formName: "X", matches: {} } };
    const { result, rerender } = renderHook(
      ({ data }) => usePredictDuplicateNameView(data),
      { initialProps: { data: all1 } },
    );
    const first = result.current;

    // Same status + name, but the inner matches map changed reference.
    const all2 = { f1: { status: "submitted", formName: "X", matches: { x: 1 } } };
    rerender({ data: all2 });
    expect(result.current).toBe(first);
  });

  it("invalidates when a name changes", () => {
    const all1 = { f1: { status: "submitted", formName: "X" } };
    const { result, rerender } = renderHook(
      ({ data }) => usePredictDuplicateNameView(data),
      { initialProps: { data: all1 } },
    );
    const first = result.current;

    const all2 = { f1: { status: "submitted", formName: "Y" } };
    rerender({ data: all2 });
    expect(result.current).not.toBe(first);
    expect(result.current.f1.formName).toBe("Y");
  });

  it("invalidates when a status flips into the candidate set", () => {
    const all1 = { f1: { status: "draft", formName: "X" } };
    const { result, rerender } = renderHook(
      ({ data }) => usePredictDuplicateNameView(data),
      { initialProps: { data: all1 } },
    );
    expect(result.current).toEqual({});

    const all2 = { f1: { status: "submitted", formName: "X" } };
    rerender({ data: all2 });
    expect(result.current.f1).toEqual({ formName: "X", status: "submitted" });
  });
});
