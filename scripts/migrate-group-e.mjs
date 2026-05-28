#!/usr/bin/env node
// One-time migration: fix Group E ECU/CUR position swap.
//
// Background: teams.ts had ECU at position 2 and CUR at position 4 in Group E.
// The correct order is CUR at position 2 and ECU at position 4.
// This caused 5 of the 6 Group E match slots to display wrong teams, and put
// each real fixture's prediction into the wrong match slot.
//
// The 6 Group E match IDs and their real fixtures (after the teams.ts fix):
//   group-E-1 (FIFA #9)  : CIV vs ECU   ← real fixture was stored in group-E-5 (reversed)
//   group-E-2 (FIFA #10) : GER vs CUR   ← real fixture was stored in group-E-6 (reversed)
//   group-E-3 (FIFA #33) : GER vs CIV   ← correct all along, untouched
//   group-E-4 (FIFA #34) : ECU vs CUR   ← real fixture was in group-E-4, just home/away reversed
//   group-E-5 (FIFA #55) : CUR vs CIV   ← real fixture was stored in group-E-1 (reversed)
//   group-E-6 (FIFA #56) : ECU vs GER   ← real fixture was stored in group-E-2 (reversed)
//
// The permutation (10 numbers across 5 match slots):
//   new E-1 = { home: old E-5.away, away: old E-5.home }
//   new E-2 = { home: old E-6.away, away: old E-6.home }
//   new E-4 = { home: old E-4.away, away: old E-4.home }   (intra-match swap)
//   new E-5 = { home: old E-1.away, away: old E-1.home }
//   new E-6 = { home: old E-2.away, away: old E-2.home }
//
// Each old value maps to exactly one new slot (clean bijection — no data
// invented or discarded). A form with all-null Group E predictions passes
// through unchanged. The idempotency flag `groupEFixApplied: true` prevents
// a second run from double-permuting.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json \
//     node scripts/migrate-group-e.mjs --dry-run
//
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json \
//     node scripts/migrate-group-e.mjs --confirm-prod

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRM = args.includes("--confirm-prod");

if (!DRY_RUN && !CONFIRM) {
  console.error("Pass --dry-run to preview, or --confirm-prod to write.");
  process.exit(1);
}

// ── Firebase init ────────────────────────────────────────────────────────────

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!saPath) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH to your service account JSON file.");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(saPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Permutation logic ────────────────────────────────────────────────────────

const AFFECTED = ["group-E-1", "group-E-2", "group-E-4", "group-E-5", "group-E-6"];

function swapPred(home, away) {
  // Reverse the home/away roles, preserving null safely.
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nGroup E migration — ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}\n`);

  const snapshot = await db.collection("predictions").get();
  console.log(`Found ${snapshot.size} form documents.\n`);

  let skipped = 0, willUpdate = 0, alreadyDone = 0;

  const updates = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    // Idempotency guard.
    if (data.groupEFixApplied) {
      alreadyDone++;
      continue;
    }

    const matches = data.matches ?? {};

    // Check if this form has any Group E predictions at all.
    const hasAny = AFFECTED.some(id => {
      const p = matches[id];
      return p && (p.homeScore != null || p.awayScore != null);
    });

    if (!hasAny) {
      // Form has no Group E predictions — still stamp it so it won't re-run,
      // but no match data needs changing.
      skipped++;
      updates.push({ ref: docSnap.ref, patch: { groupEFixApplied: true } });
      continue;
    }

    // Log the before/after for the 5 affected matches.
    console.log(`Form: ${docSnap.id}`);
    const newMatches = applyPermutation(matches);

    for (const id of AFFECTED) {
      const before = matches[id] ?? {};
      const after = newMatches[id];
      const bStr = `${before.homeScore ?? "—"} - ${before.awayScore ?? "—"}`;
      const aStr = `${after.homeScore ?? "—"} - ${after.awayScore ?? "—"}`;
      if (bStr !== aStr) {
        console.log(`  ${id}: ${bStr}  →  ${aStr}`);
      }
    }

    willUpdate++;
    updates.push({
      ref: docSnap.ref,
      patch: { matches: newMatches, groupEFixApplied: true },
    });
  }

  console.log(`\nSummary:`);
  console.log(`  Already migrated : ${alreadyDone}`);
  console.log(`  No Group E data  : ${skipped}`);
  console.log(`  Will update      : ${willUpdate}`);
  console.log(`  Total            : ${snapshot.size}`);

  if (DRY_RUN) {
    console.log("\nDry run complete — no writes made.");
    return;
  }

  // Write in Firestore batches (max 500 ops per batch).
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { ref, patch } of updates.slice(i, i + BATCH_SIZE)) {
      batch.update(ref, patch);
    }
    await batch.commit();
    written += updates.slice(i, i + BATCH_SIZE).length;
    console.log(`Committed ${written}/${updates.length} documents...`);
  }

  console.log("\nMigration complete.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
