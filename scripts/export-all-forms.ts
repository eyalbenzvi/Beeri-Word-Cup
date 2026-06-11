#!/usr/bin/env node
// One-off admin export: pull every submitted prediction form from Firestore
// and write a single readable Excel workbook (summary + group-stage matrix +
// knockout matrix + raw long-format data). Read-only — performs no writes.
//
// This file imports the project's TypeScript modules (bracket computation,
// match/team data), so it is run through esbuild rather than node directly:
//
//   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/svc.json npm run export:forms
//
// Credentials (same service account as the migration scripts):
//   FIREBASE_SERVICE_ACCOUNT_PATH — path to a service-account JSON file, or
//   FIREBASE_SERVICE_ACCOUNT      — the JSON itself (as on Netlify).
//
// Optional:
//   EXPORT_OUT — output path (default: all-predictions-<YYYY-MM-DD>.xlsx).

import { readFileSync } from "fs";
import admin from "firebase-admin";
import XLSX from "xlsx";
import { buildAllFormsWorkbook, unwrapDirectory } from "../src/utils/exportAllFormsExcel";
import { normalizeStatus } from "../src/utils/helpers";

function loadServiceAccount(): Record<string, any> {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) return JSON.parse(inline);
  console.error(
    "Set FIREBASE_SERVICE_ACCOUNT_PATH (path to service-account JSON) or " +
      "FIREBASE_SERVICE_ACCOUNT (the JSON itself).",
  );
  process.exit(2);
}

async function main() {
  const svc = loadServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(svc as any) });
  const db = admin.firestore();

  console.log("Fetching predictions and user directory…");
  const [formsSnap, dirSnap] = await Promise.all([
    db.collection("predictions").get(),
    db.doc("gameData/userDirectory").get(),
  ]);

  const formsById: Record<string, any> = {};
  formsSnap.forEach((doc) => {
    formsById[doc.id] = doc.data();
  });
  const directory = unwrapDirectory(dirSnap.exists ? dirSnap.data() : null);

  const total = Object.keys(formsById).length;
  const submitted = Object.values(formsById).filter(
    (f: any) => normalizeStatus(f?.status) === "submitted",
  ).length;
  console.log(`Found ${total} forms (${submitted} submitted, ${total - submitted} drafts skipped).`);

  const sheets = buildAllFormsWorkbook(formsById, directory);

  const wb = XLSX.utils.book_new();
  wb.Props = { Title: "כל הניחושים" };
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = sheet.cols;
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  // All content is Hebrew — RTL at workbook level, same as exportFormExcel.
  wb.Workbook = { Views: [{ RTL: true }] };

  const out =
    process.env.EXPORT_OUT ||
    `all-predictions-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, out);
  console.log(`Wrote ${out} (${sheets.length} sheets, ${submitted} forms).`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
