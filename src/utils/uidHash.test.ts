import { describe, it, expect } from "vitest";
import { deriveHashedUid, isPhoneUid, PHONE_UID_PREFIX } from "./uidHash";

describe("deriveHashedUid", () => {
  const SALT = "test-salt-deterministic-fixture-do-not-use-in-prod";

  it("produces a `phone_` prefix + 16 hex chars", () => {
    const uid = deriveHashedUid("0501234567", SALT);
    expect(uid).toMatch(/^phone_[0-9a-f]{16}$/);
  });

  it("is deterministic — same (phone, salt) → same UID", () => {
    const a = deriveHashedUid("0501234567", SALT);
    const b = deriveHashedUid("0501234567", SALT);
    expect(a).toBe(b);
  });

  it("two different phones produce different UIDs", () => {
    const a = deriveHashedUid("0501234567", SALT);
    const b = deriveHashedUid("0507654321", SALT);
    expect(a).not.toBe(b);
  });

  it("two different salts produce different UIDs for the same phone", () => {
    const a = deriveHashedUid("0501234567", SALT);
    const b = deriveHashedUid("0501234567", "different-salt");
    expect(a).not.toBe(b);
  });

  it("does not contain the phone number anywhere in the UID", () => {
    // The whole point: a leaked UID must not reveal the phone.
    const phone = "0501234567";
    const uid = deriveHashedUid(phone, SALT);
    expect(uid).not.toContain(phone);
    // Last 4 digits are the most likely to be guessable; double-check.
    expect(uid).not.toContain(phone.slice(-4));
  });

  it("throws on empty phone", () => {
    expect(() => deriveHashedUid("", SALT)).toThrow();
  });

  it("throws on empty salt", () => {
    expect(() => deriveHashedUid("0501234567", "")).toThrow();
  });
});

describe("isPhoneUid", () => {
  it("recognises legacy phone_<phone> UIDs", () => {
    expect(isPhoneUid("phone_0501234567")).toBe(true);
  });
  it("recognises hashed phone_<hash> UIDs", () => {
    expect(isPhoneUid("phone_a1b2c3d4e5f60718")).toBe(true);
  });
  it("rejects non-phone UIDs", () => {
    expect(isPhoneUid("abc123")).toBe(false);
    expect(isPhoneUid("google-uid-123")).toBe(false);
  });
  it("handles null / undefined", () => {
    expect(isPhoneUid(null)).toBe(false);
    expect(isPhoneUid(undefined)).toBe(false);
  });
  it("PHONE_UID_PREFIX is the expected string", () => {
    expect(PHONE_UID_PREFIX).toBe("phone_");
  });
});
