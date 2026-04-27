#!/usr/bin/env node
// Backfill gameData/userDirectory + userPrivate/{uid} from the legacy
// gameData/users doc. Idempotent — safe to re-run after partial failure.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
//     node scripts/migrate-userDirectory.mjs --dry-run
//
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
//     node scripts/migrate-userDirectory.mjs --confirm-prod
//
// Safety:
//   - Refuses to write without --confirm-prod.
//   - --dry-run prints the diff and exits 0 without touching Firestore.
//   - Reads both legacy users AND the existing directory/userPrivate so
//     a re-run after partial completion only writes the missing entries.

import { readFileSync } from "fs";
import admin from "firebase-admin";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const CONFIRM = args.has("--confirm-prod");
const VERBOSE = args.has("--verbose");

if (!DRY_RUN && !CONFIRM) {
  console.error(
    "Refusing to run without --dry-run or --confirm-prod. Default is dry-run.",
  );
  process.exit(2);
}

const svcPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!svcPath) {
  console.error("FIREBASE_SERVICE_ACCOUNT_PATH env var is required.");
  process.exit(2);
}

let svcAccount;
try {
  svcAccount = JSON.parse(readFileSync(svcPath, "utf8"));
} catch (err) {
  console.error(`Could not read service account at ${svcPath}: ${err.message}`);
  process.exit(2);
}

admin.initializeApp({
  credential: admin.credential.cert(svcAccount),
});
const db = admin.firestore();

// Field classification — MUST stay in sync with src/store.js + firestore.rules.
const DIRECTORY_FIELDS = ["displayName", "firstName", "lastName"];
const USER_PRIVATE_FIELDS = [
  "id",
  "email",
  "isAdmin",
  "profileCompleted",
  "lastLoginAt",
  "createdAt",
  "photoURL",
];

function pickKnown(obj, allowed) {
  const out = {};
  for (const k of allowed) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function shallowEqual(a, b) {
  if (!a || !b) return a === b;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

async function main() {
  console.log(`[migrate] mode = ${DRY_RUN ? "DRY-RUN" : "WRITE"}`);
  console.log("[migrate] Reading legacy gameData/users …");
  const usersSnap = await db.doc("gameData/users").get();
  if (!usersSnap.exists) {
    console.error("gameData/users does not exist — nothing to migrate.");
    process.exit(1);
  }
  const legacyUsers = usersSnap.data()?.data || {};
  const uids = Object.keys(legacyUsers);
  console.log(`[migrate] Found ${uids.length} users in legacy doc.`);

  console.log("[migrate] Reading existing gameData/userDirectory …");
  const dirSnap = await db.doc("gameData/userDirectory").get();
  const existingDirectory = dirSnap.exists ? dirSnap.data()?.data || {} : {};

  console.log("[migrate] Reading existing userPrivate collection …");
  const privSnap = await db.collection("userPrivate").get();
  const existingPrivate = {};
  privSnap.forEach((d) => {
    existingPrivate[d.id] = d.data();
  });

  // Plan: directory entry + private doc per uid. Skip if already in sync.
  const directoryWrites = {}; // {uid: derivedDirEntry}
  const privateWrites = []; // [{uid, fields}]
  for (const uid of uids) {
    const u = legacyUsers[uid];
    if (!u || typeof u !== "object") continue;

    const dirEntry = pickKnown(u, DIRECTORY_FIELDS);
    if (!shallowEqual(dirEntry, existingDirectory[uid])) {
      directoryWrites[uid] = dirEntry;
    }

    const privEntry = pickKnown(u, USER_PRIVATE_FIELDS);
    if (!shallowEqual(privEntry, existingPrivate[uid])) {
      privateWrites.push({ uid, fields: privEntry });
    }
  }

  console.log(
    `[migrate] Plan: ${Object.keys(directoryWrites).length} directory entries, ${privateWrites.length} userPrivate docs.`,
  );

  if (VERBOSE) {
    for (const [uid, entry] of Object.entries(directoryWrites)) {
      console.log(`  directory[${uid}] <- ${JSON.stringify(entry)}`);
    }
    for (const { uid, fields } of privateWrites) {
      console.log(`  userPrivate/${uid} <- ${JSON.stringify(fields)}`);
    }
  }

  if (DRY_RUN) {
    console.log("[migrate] Dry run — no writes. Re-run with --confirm-prod.");
    return;
  }

  // Write the directory in a single set(merge:true). Firestore caps a
  // single doc at 1 MB, but the directory entries are ~150 bytes each,
  // so even at 5000 users the doc is ~750 KB — fine.
  if (Object.keys(directoryWrites).length > 0) {
    await db.doc("gameData/userDirectory").set(
      { data: directoryWrites },
      { merge: true },
    );
    console.log(
      `[migrate] Wrote ${Object.keys(directoryWrites).length} directory entries.`,
    );
  } else {
    console.log("[migrate] Directory already in sync; skipped.");
  }

  // Write private docs in batches of 400 (Firestore batch limit is 500).
  const BATCH = 400;
  for (let i = 0; i < privateWrites.length; i += BATCH) {
    const chunk = privateWrites.slice(i, i + BATCH);
    const batch = db.batch();
    for (const { uid, fields } of chunk) {
      batch.set(db.doc(`userPrivate/${uid}`), fields, { merge: true });
    }
    await batch.commit();
    console.log(
      `[migrate] Wrote userPrivate batch ${Math.floor(i / BATCH) + 1} (${chunk.length} docs).`,
    );
  }

  console.log("[migrate] Done.");
}

main().catch((err) => {
  console.error("[migrate] FATAL:", err);
  process.exit(1);
});
