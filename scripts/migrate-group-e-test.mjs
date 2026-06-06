#!/usr/bin/env node
// Targeted test: apply the Group E fix to the single form owned by ebenzvi@gmail.com.
// Use this to verify the permutation logic before running the full migration.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json \
//     node scripts/migrate-group-e-test.mjs --dry-run
//
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json \
//     node scripts/migrate-group-e-test.mjs --confirm-prod

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRM = args.includes("--confirm-prod");

if (!DRY_RUN && !CONFIRM) {
  console.error("Pass --dry-run to preview, or --confirm-prod to write.");
  process.exit(1);
}

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!saPath) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH to your service account JSON file.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, "utf8"))) });
const db = getFirestore();

const ADMIN_EMAIL = "ebenzvi@gmail.com";
const AFFECTED = ["group-E-1", "group-E-2", "group-E-4", "group-E-5", "group-E-6"];

function swapPred(home, away) {
  return { homeScore: away ?? null, awayScore: home ?? null };
}

function applyPermutation(matches) {
  const e1 = matches["group-E-1"] ?? {};
  const e2 = matches["group-E-2"] ?? {};
  const e4 = matches["group-E-4"] ?? {};
  const e5 = matches["group-E-5"] ?? {};
  const e6 = matches["group-E-6"] ?? {};
  return {
    ...matches,
    "group-E-1": swapPred(e5.homeScore ?? null, e5.awayScore ?? null),
    "group-E-2": swapPred(e6.homeScore ?? null, e6.awayScore ?? null),
    "group-E-4": swapPred(e4.homeScore ?? null, e4.awayScore ?? null),
    "group-E-5": swapPred(e1.homeScore ?? null, e1.awayScore ?? null),
    "group-E-6": swapPred(e2.homeScore ?? null, e2.awayScore ?? null),
  };
}

async function main() {
  // Resolve email → UID
  const userRecord = await getAuth().getUserByEmail(ADMIN_EMAIL);
  console.log(`\nUser: ${ADMIN_EMAIL}`);
  console.log(`UID:  ${userRecord.uid}\n`);

  // Find their prediction form(s)
  const snapshot = await db.collection("predictions")
    .where("userId", "==", userRecord.uid)
    .get();

  if (snapshot.empty) {
    console.log("No forms found for this user.");
    return;
  }

  console.log(`Found ${snapshot.size} form(s).\n`);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    console.log(`Form: ${docSnap.id}`);

    if (data.groupEFixApplied) {
      console.log("  Already migrated — skipping.\n");
      continue;
    }

    const matches = data.matches ?? {};
    const newMatches = applyPermutation(matches);

    console.log("  Group E — before → after:");
    for (const id of AFFECTED) {
      const b = matches[id] ?? {};
      const a = newMatches[id];
      const bStr = `${b.homeScore ?? "—"} - ${b.awayScore ?? "—"}`;
      const aStr = `${a.homeScore ?? "—"} - ${a.awayScore ?? "—"}`;
      const changed = bStr !== aStr ? " *" : "";
      console.log(`    ${id}:  ${bStr}  →  ${aStr}${changed}`);
    }

    if (CONFIRM) {
      await docSnap.ref.update({ matches: newMatches, groupEFixApplied: true });
      console.log("  Written to Firestore.\n");
    } else {
      console.log("  (dry run — no write)\n");
    }
  }

  if (DRY_RUN) {
    console.log("Dry run complete — no writes made.");
  } else {
    console.log("Done.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
