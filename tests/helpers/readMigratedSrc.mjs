// Migration-aware source-file reader. During the TypeScript migration,
// a path stored as `.js` / `.jsx` may already have moved to `.ts` / `.tsx`.
// Tests that grep source files use this helper so a renamed file doesn't
// silently turn the test into a no-op (readFileSync would throw or, worse,
// the test would fall back to "" and pass for the wrong reason).
//
// Usage:
//   import { readMigratedSrc } from "../helpers/readMigratedSrc.mjs";
//   const src = readMigratedSrc("src/components/Score.jsx");
import fs from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = "/home/user/Beeri-World-Cup";

function readSplitModule(baseDir, encoding) {
  // For a directory like src/store/, return the concatenation of every
  // *.ts / *.tsx file inside (including index). This mirrors the
  // pre-split flat file: tests that grep for symbols in "store.js" still
  // find them after the module split, regardless of which submodule owns
  // the declaration.
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return null;
  }
  const parts = [];
  for (const name of fs.readdirSync(baseDir).sort()) {
    if (/\.(ts|tsx|js|jsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      parts.push(fs.readFileSync(`${baseDir}/${name}`, encoding));
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function readMigratedSrc(relOrAbsPath, encoding = "utf8") {
  const absPath = relOrAbsPath.startsWith("/") ? relOrAbsPath : resolve(REPO_ROOT, relOrAbsPath);
  try {
    return fs.readFileSync(absPath, encoding);
  } catch (err) {
    const swap = { ".js": ".ts", ".jsx": ".tsx" };
    for (const [from, to] of Object.entries(swap)) {
      if (absPath.endsWith(from)) {
        const swapped = absPath.slice(0, -from.length) + to;
        try { return fs.readFileSync(swapped, encoding); } catch { /* fall through */ }
        // Module-split: src/foo.js -> src/foo/*.{ts,tsx,js,jsx}.
        // Returns the concatenation so static-grep tests still find every
        // symbol after the split.
        const baseDir = absPath.slice(0, -from.length);
        const split = readSplitModule(baseDir, encoding);
        if (split !== null) return split;
      }
    }
    throw err;
  }
}

// Migration-aware existsSync. True if either the recorded path or its
// .ts/.tsx counterpart is present.
export function existsMigratedSrc(relOrAbsPath) {
  const absPath = relOrAbsPath.startsWith("/") ? relOrAbsPath : resolve(REPO_ROOT, relOrAbsPath);
  if (fs.existsSync(absPath)) return true;
  const swap = { ".js": ".ts", ".jsx": ".tsx" };
  for (const [from, to] of Object.entries(swap)) {
    if (absPath.endsWith(from)) {
      const swapped = absPath.slice(0, -from.length) + to;
      if (fs.existsSync(swapped)) return true;
      // Module-split fallback: src/foo.js -> src/foo/index.*
      const baseDir = absPath.slice(0, -from.length);
      for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
        if (fs.existsSync(`${baseDir}/index${ext}`)) return true;
      }
    }
  }
  return false;
}
