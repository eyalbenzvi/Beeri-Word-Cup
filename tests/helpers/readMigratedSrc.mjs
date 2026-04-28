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
    }
  }
  return false;
}
