#!/usr/bin/env node
// Migrate phone-auth users from the legacy `phone_<phone>` UID format to
// random opaque `phone_<16-hex>` UIDs derived via SHA-256(salt + phone).
//
// Why: the legacy UID embeds the user's phone number, which then leaks
// into prediction formIds (`<uid>__<ts>`), audit logs, and any place a
// uid is exposed to other authenticated users. Hashed UIDs are opaque
// by construction — same input, same salt → same UID, but the phone
// can't be recovered from the UID.
//
// Strategy (per phone user, idempotent — safe to re-run after partial
// failure thanks to the uidMigrationMap check at the top of the loop):
//   1. Compute hashedUid = `phone_${SHA256(OTP_SALT + phone).slice(0,16)}`.
//   2. Move predictions: rename each `<legacyUid>__<ts>` doc to
//      `<hashedUid>__<ts>`, rewrite userId, delete old doc.
//   3. Move userPrivate/{legacyUid} → userPrivate/{hashedUid}.
//   4. Move userDirectory[legacyUid] → userDirectory[hashedUid].
//   5. Move gameData/users[legacyUid] → gameData/users[hashedUid].
//   6. Record the mapping in gameData/uidMigrationMap so the verify-otp
//      function can resolve a phone → hashedUid lookup even if the
//      salt is rotated later.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
//   OTP_SALT=<same-value-as-netlify-OTP_SALT-env-var> \
//     node scripts/migrate-uids.mjs --dry-run
//
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json \
//   OTP_SALT=<same-value-as-netlify-OTP_SALT-env-var> \
//     node scripts/migrate-uids.mjs --confirm-prod
//
// Optional flags:
//   --revoke-tokens   Also call admin.auth().revokeRefreshTokens on each
//                     legacy UID so any still-active session is invalidated
//                     server-side.  Without this, sessions keep working
//                     against the (now empty) legacy UID until the JWT
//                     expires (~1h).
//   --verbose         Per-user log output.
//
// Safety:
//   - Refuses to run without --dry-run or --confirm-prod (no surprise writes).
//   - Refuses to run if predictions are not locked — the migration must
//     happen during a maintenance window so no user is mid-edit.
//   - Per-user batch is atomic (single writeBatch). A network failure
//     mid-user means that user is not migrated; re-running the script
//     skips already-migrated users (uidMigrationMap check) and finishes
//     the rest.

import { readFileSync } from "fs";
import { createHash } from "crypto";
import admin from "firebase-admin";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const CONFIRM = args.has("--confirm-prod");
const VERBOSE = args.has("--verbose");
const REVOKE = args.has("--revoke-tokens");

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
const salt = process.env.OTP_SALT;
if (!salt) {
  console.error(
    "OTP_SALT env var is required.  Use the same value you set on the " +
      "Netlify phone-verify-otp function — otherwise hashed UIDs won't " +
      "match what the verify endpoint mints at login.",
  );
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

// MUST stay in sync with src/utils/uidHash.ts.
function deriveHashedUid(phone, saltVal) {
  if (!phone) throw new Error("deriveHashedUid: phone is required");
  if (!saltVal) throw new Error("deriveHashedUid: salt is required");
  const digest = createHash("sha256").update(saltVal).update(phone).digest("hex");
  return `phone_${digest.slice(0, 16)}`;
}

// Legacy UID always has the form `phone_<digits>` where digits is the raw
// phone number. Anything else (Google UID, already-hashed UID) is left alone.
const LEGACY_UID_RE = /^phone_(\d{9,15})$/;

async function main() {
  console.log(`[migrate-uids] mode = ${DRY_RUN ? "DRY-RUN" : "WRITE"}`);

  // Hard precondition: predictions must be locked.  The script renames
  // prediction docs en-masse and rewrites their userId; doing that while
  // a user is mid-edit would lose writes.
  const settingsSnap = await db.doc("gameData/settings").get();
  const locked = !!settingsSnap.data()?.data?.predictionsLocked;
  if (!locked) {
    console.error(
      "[migrate-uids] Predictions are NOT locked.  Set " +
        "gameData/settings.data.predictionsLocked = true before running " +
        "this migration.  Aborting.",
    );
    process.exit(3);
  }

  console.log("[migrate-uids] Reading legacy gameData/users …");
  const usersSnap = await db.doc("gameData/users").get();
  if (!usersSnap.exists) {
    console.error("[migrate-uids] gameData/users does not exist — nothing to migrate.");
    process.exit(1);
  }
  const legacyUsers = usersSnap.data()?.data || {};

  console.log("[migrate-uids] Reading existing gameData/userDirectory …");
  const dirSnap = await db.doc("gameData/userDirectory").get();
  const directory = dirSnap.exists ? dirSnap.data()?.data || {} : {};

  console.log("[migrate-uids] Reading existing gameData/uidMigrationMap …");
  const mapSnap = await db.doc("gameData/uidMigrationMap").get();
  const existingMap = mapSnap.exists ? mapSnap.data()?.data || {} : {};

  // Identify phone users.  Skip any UID that's already hashed-format or
  // already present in the migration map.
  const phoneUsers = [];
  for (const uid of Object.keys(legacyUsers)) {
    const m = uid.match(LEGACY_UID_RE);
    if (!m) continue;
    if (existingMap[uid]) {
      if (VERBOSE) console.log(`  skip ${uid} — already in uidMigrationMap`);
      continue;
    }
    phoneUsers.push({ legacyUid: uid, phone: m[1] });
  }
  console.log(
    `[migrate-uids] ${phoneUsers.length} phone user(s) to migrate.  ` +
      `(${Object.keys(existingMap).length} already migrated.)`,
  );

  if (phoneUsers.length === 0) {
    console.log("[migrate-uids] Nothing to do.");
    return;
  }

  // Detect collisions: two different legacy UIDs hashing to the same
  // value.  Astronomically unlikely with 64 bits of entropy but we check
  // anyway because a collision would silently merge two users' data.
  const hashSeen = new Map();
  for (const { legacyUid, phone } of phoneUsers) {
    const h = deriveHashedUid(phone, salt);
    if (hashSeen.has(h)) {
      console.error(
        `[migrate-uids] HASH COLLISION: ${legacyUid} and ${hashSeen.get(h)} ` +
          `both hash to ${h}.  Aborting before any writes.`,
      );
      process.exit(4);
    }
    hashSeen.set(h, legacyUid);
  }

  // Also check that no hashedUid collides with an EXISTING (non-migrating)
  // uid in gameData/users — e.g., a Google user whose UID happens to be
  // shaped like phone_<hex>.
  for (const { legacyUid, phone } of phoneUsers) {
    const h = deriveHashedUid(phone, salt);
    if (legacyUsers[h] && h !== legacyUid) {
      console.error(
        `[migrate-uids] HASH COLLISION with existing user: ${legacyUid} → ` +
          `${h}, but ${h} is already in gameData/users.  Aborting.`,
      );
      process.exit(4);
    }
  }

  console.log(
    `[migrate-uids] No hash collisions.  Beginning ${DRY_RUN ? "plan" : "migration"} …`,
  );

  let migrated = 0;
  for (const { legacyUid, phone } of phoneUsers) {
    const hashedUid = deriveHashedUid(phone, salt);
    if (VERBOSE) console.log(`  ${legacyUid} → ${hashedUid}`);

    // Read all of this user's predictions up-front.  formIds follow
    // `<uid>__<digits>`.
    const predsSnap = await db
      .collection("predictions")
      .where("userId", "==", legacyUid)
      .get();

    const batch = db.batch();

    // 1. Predictions: rewrite to new formId + new userId, delete old.
    for (const pred of predsSnap.docs) {
      const oldId = pred.id;
      const ts = oldId.startsWith(legacyUid + "__")
        ? oldId.slice(legacyUid.length + 2)
        : null;
      if (!ts) {
        // Defensive: a pred whose formId doesn't follow the expected
        // shape is something only an admin could have written.  Rewrite
        // userId in place rather than renaming the doc.
        console.warn(
          `[migrate-uids] WARN: prediction ${oldId} has unexpected shape; ` +
            `rewriting userId in place.`,
        );
        batch.update(pred.ref, { userId: hashedUid });
        continue;
      }
      const newId = `${hashedUid}__${ts}`;
      const data = pred.data();
      batch.set(db.doc(`predictions/${newId}`), {
        ...data,
        userId: hashedUid,
      });
      batch.delete(pred.ref);
    }

    // 2. userPrivate/{legacyUid} → userPrivate/{hashedUid}
    const privSnap = await db.doc(`userPrivate/${legacyUid}`).get();
    if (privSnap.exists) {
      const data = privSnap.data() || {};
      batch.set(db.doc(`userPrivate/${hashedUid}`), {
        ...data,
        id: hashedUid,
      });
      batch.delete(privSnap.ref);
    }

    // 3. userDirectory[legacyUid] → userDirectory[hashedUid]
    if (directory[legacyUid]) {
      batch.set(
        db.doc("gameData/userDirectory"),
        {
          data: {
            [hashedUid]: directory[legacyUid],
            [legacyUid]: admin.firestore.FieldValue.delete(),
          },
        },
        { merge: true },
      );
    }

    // 4. gameData/users[legacyUid] → gameData/users[hashedUid]
    const userEntry = legacyUsers[legacyUid];
    if (userEntry) {
      const newEntry = { ...userEntry };
      if (newEntry.id) newEntry.id = hashedUid;
      batch.set(
        db.doc("gameData/users"),
        {
          data: {
            [hashedUid]: newEntry,
            [legacyUid]: admin.firestore.FieldValue.delete(),
          },
        },
        { merge: true },
      );
    }

    // 5. uidMigrationMap[legacyUid] = hashedUid
    batch.set(
      db.doc("gameData/uidMigrationMap"),
      {
        data: {
          [legacyUid]: hashedUid,
        },
      },
      { merge: true },
    );

    if (DRY_RUN) {
      console.log(
        `  [DRY] ${legacyUid} → ${hashedUid}: ${predsSnap.size} prediction(s), ` +
          `userPrivate=${privSnap.exists}, directory=${!!directory[legacyUid]}.`,
      );
    } else {
      await batch.commit();
      migrated += 1;
      console.log(
        `  ✓ ${legacyUid} → ${hashedUid}  ` +
          `(${predsSnap.size} predictions migrated)`,
      );

      if (REVOKE) {
        try {
          await admin.auth().revokeRefreshTokens(legacyUid);
        } catch (err) {
          // Most likely "user not found" — phone-auth users created via
          // custom token aren't always present in Auth's user table.
          if (VERBOSE) {
            console.log(
              `    (revokeRefreshTokens(${legacyUid}) skipped: ${err.message})`,
            );
          }
        }
      }
    }
  }

  if (DRY_RUN) {
    console.log(
      `[migrate-uids] Dry run complete.  Re-run with --confirm-prod to write.`,
    );
  } else {
    console.log(`[migrate-uids] Done.  Migrated ${migrated} user(s).`);
    console.log(
      `[migrate-uids] Reminder: flip Netlify env USE_HASHED_UID=true and ` +
        `redeploy phone-verify-otp before unlocking predictions.`,
    );
  }
}

main().catch((err) => {
  console.error("[migrate-uids] FATAL:", err);
  process.exit(1);
});
