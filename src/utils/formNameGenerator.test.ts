import { describe, it, expect } from "vitest";
import { generateDefaultFormName, DEFAULT_FORM_NAME_FALLBACK } from "./formNameGenerator";

// Pure default-name generator: "{nickname}", then "{nickname} 2", "{nickname} 3"…
// avoiding collisions with the user's own forms (any status) and with any
// user's submitted/approved/pending forms (the unique-name submission rule).

describe("generateDefaultFormName", () => {
  it("returns the bare nickname for a first form", () => {
    expect(generateDefaultFormName({ nickname: "דני" })).toBe("דני");
  });

  it("falls back to the default when nickname is empty/whitespace", () => {
    expect(generateDefaultFormName({ nickname: "   " })).toBe(DEFAULT_FORM_NAME_FALLBACK);
    expect(generateDefaultFormName({})).toBe(DEFAULT_FORM_NAME_FALLBACK);
  });

  it("appends ' 2' when the user already owns a form with the base name", () => {
    const userForms = [{ formName: "דני" }];
    expect(generateDefaultFormName({ nickname: "דני", userForms })).toBe("דני 2");
  });

  it("skips to the first free index across the user's own forms", () => {
    const userForms = [{ formName: "דני" }, { formName: "דני 2" }];
    expect(generateDefaultFormName({ nickname: "דני", userForms })).toBe("דני 3");
  });

  it("is case-insensitive when detecting collisions", () => {
    const userForms = [{ formName: "Beeri" }];
    expect(generateDefaultFormName({ nickname: "beeri", userForms })).toBe("beeri 2");
  });

  it("avoids names taken by another user's submitted/approved/pending form", () => {
    const allPredictions = {
      f1: { formName: "דני", status: "submitted" },
    };
    expect(generateDefaultFormName({ nickname: "דני", allPredictions })).toBe("דני 2");
  });

  it("ignores another user's DRAFT form (drafts don't block the unique-name rule)", () => {
    const allPredictions = {
      f1: { formName: "דני", status: "draft" },
    };
    expect(generateDefaultFormName({ nickname: "דני", allPredictions })).toBe("דני");
  });
});
