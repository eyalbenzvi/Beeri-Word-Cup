// Random-looking phone-auth UID derivation.
//
// Background: phone-auth UIDs were originally `phone_<E.164 number>`
// (e.g. `phone_05XXXXXXXX`). That format leaks the user's mobile number
// into every doc id derived from the UID — most notably the form-id
// pattern `<uid>__<ts>`, which any signed-in member can list once
// predictions are unlocked.
//
// The fix is to map (phone, secret salt) -> a stable but opaque hash.
// The salt is a server-side env var (OTP_SALT). It MUST be set once and
// NEVER rotated — rotating the salt orphans every existing user record.
//
// Properties of the hash:
//   - deterministic: same (phone, salt) -> same UID. Required so that a
//     re-login of an existing user resolves to their stored data.
//   - opaque: a leaked UID can't be reversed to the phone without the
//     salt. (16 hex chars = 64 bits of address space; well above any
//     phone-number-space brute-force without a dictionary attack
//     against the salt.)
//   - collision-resistant: SHA-256 of (salt || phone) makes collisions
//     astronomically unlikely.
//   - prefixed: `phone_` prefix is preserved so client code that
//     branches on the prefix (e.g. useStore.tsx onAuthStateChanged
//     handler) keeps working.
//
// The legacy `phone_05XXXXXXXX` format remains supported behind a
// feature flag (USE_HASHED_UID env var) so we can stage the cut-over.
// One-time migration script (scripts/migrate-uids.mjs) backfills
// existing users; the resulting old-uid -> new-uid map is stored in
// gameData/uidMigrationMap.
//
// This module is consumed only by Node code paths (the Netlify
// phone-verify-otp function and the migration script + tests).  The
// triple-slash reference below makes `node`'s `crypto` types resolve
// without polluting the rest of the browser-facing src/ tree with Node
// globals.

/// <reference types="node" />
import { createHash } from "crypto";

/**
 * Derive a stable hashed UID for a phone-auth user.
 *
 * @param phone canonicalized E.164-style phone (e.g. "05XXXXXXXX").
 *              Caller MUST canonicalize first via normalizeIsraeliMobile.
 * @param salt  the server-side OTP_SALT env var. Lose this and every
 *              phone-auth user is orphaned — back it up offline.
 * @returns     `phone_<16 hex chars>` — same uid every time, opaque
 *              without the salt.
 *
 * Throws on missing/empty arguments rather than producing a silent
 * default that could collide across users.
 */
export function deriveHashedUid(phone: string, salt: string): string {
  if (!phone) throw new Error("deriveHashedUid: phone is required");
  if (!salt) throw new Error("deriveHashedUid: salt is required");
  // The hash input order is (salt, phone). Putting the salt first
  // prevents length-extension shenanigans that would matter if we ever
  // switched to HMAC; with plain SHA-256 it's belt-and-braces.
  const digest = createHash("sha256")
    .update(salt)
    .update(phone)
    .digest("hex");
  return `phone_${digest.slice(0, 16)}`;
}

// Discriminator used by client code + the migration script to tell
// "this is a phone-auth UID" without depending on the format. Both old
// and new UIDs start with `phone_`.
export const PHONE_UID_PREFIX = "phone_";
export function isPhoneUid(uid: string | null | undefined): boolean {
  return typeof uid === "string" && uid.startsWith(PHONE_UID_PREFIX);
}
