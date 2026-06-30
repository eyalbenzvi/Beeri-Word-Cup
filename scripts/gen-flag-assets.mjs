// Regenerates src/data/flagAssets.ts — base64-inlined flag images (from the
// country-flag-icons devDependency) keyed by FIFA team code, used by the
// scenario infographic (src/utils/scenarioInfographic.ts).
//
// Why inline: flag EMOJI don't render on Linux/Windows desktop (they fall back
// to the two-letter country code), and an SVG loaded into an <img> for canvas
// rasterisation (the PNG export) cannot fetch external images. Embedding the
// flags as data URIs makes them render reliably both on-screen and in the export.
//
// Run from the repo root after the team list changes:
//   node --loader ./tests/loader.mjs scripts/gen-flag-assets.mjs
//
// The ISO-3166-1 alpha-2 code is decoded straight from each team's flag emoji
// (regional-indicator pair), with the GB subdivisions handled specially.

import { ALL_TEAMS } from "../src/data/teams.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function flagToIso(flag) {
  if (!flag) return null;
  const cps = [...flag].map((c) => c.codePointAt(0));
  if (cps[0] === 0x1f3f4) {
    const tags = cps
      .slice(1)
      .filter((c) => c >= 0xe0061 && c <= 0xe007a)
      .map((c) => String.fromCharCode(c - 0xe0000))
      .join("");
    if (tags.includes("sct")) return "GB-SCT";
    if (tags.includes("eng")) return "GB-ENG";
    if (tags.includes("wls")) return "GB-WLS";
    return null;
  }
  const letters = cps
    .filter((c) => c >= 0x1f1e6 && c <= 0x1f1ff)
    .map((c) => String.fromCharCode(c - 0x1f1e6 + 65))
    .join("");
  return letters.length === 2 ? letters : null;
}

const FLAG_DIR = resolve(ROOT, "node_modules/country-flag-icons/3x2");
const entries = [];
const missing = [];
for (const t of ALL_TEAMS) {
  const iso = flagToIso(t.flag);
  const p = iso ? resolve(FLAG_DIR, `${iso}.svg`) : null;
  if (!p || !fs.existsSync(p)) {
    missing.push(`${t.code}(${iso})`);
    continue;
  }
  const b64 = Buffer.from(fs.readFileSync(p, "utf8").trim(), "utf8").toString("base64");
  entries.push(`  ${JSON.stringify(t.code)}: "data:image/svg+xml;base64,${b64}",`);
}

const out = `// AUTO-GENERATED — do not edit by hand. Run scripts/gen-flag-assets.mjs.
// Base64 flag images (country-flag-icons 3x2 SVGs) keyed by FIFA team code,
// for the scenario infographic. Inlined so the infographic SVG renders flags
// reliably everywhere (Linux/Windows lack flag emoji) AND in the rasterised
// PNG export (an SVG loaded into an <img> cannot fetch external images).
export const FLAG_DATA_URIS: Record<string, string> = {
${entries.join("\n")}
};
`;
fs.writeFileSync(resolve(ROOT, "src/data/flagAssets.ts"), out);
console.log(`wrote ${entries.length} flags; missing: ${missing.join(", ") || "none"}`);
