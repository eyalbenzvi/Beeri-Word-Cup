// Node ESM loader for the legacy harness.
//
// Resolves bare relative imports (no extension) to whichever of .js / .ts
// exists, and transforms .ts files on the fly via esbuild. .jsx / .tsx
// files use loader-jsx.mjs instead.
//
// Both extensions are supported during the TypeScript migration window so
// each conversion commit can land without breaking tests.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
import { transform } from "esbuild";

const RESOLVE_EXTS = [".js", ".ts", ".json"];

function resolveRelative(specifier, parentURL) {
  if (!parentURL) return null;
  const parentPath = fileURLToPath(parentURL);
  const candidate = pathResolve(dirname(parentPath), specifier);
  for (const ext of RESOLVE_EXTS) {
    if (fs.existsSync(candidate + ext)) {
      return specifier + ext;
    }
  }
  return null;
}

// Redirect `.js` -> `.ts` if the legacy test imports an extension explicitly
// but the source has been migrated. Same for absolute paths used by some
// of the older test files. Without this, every test that does
// `import "../src/foo.js"` would break on the day foo migrates to TypeScript.
function redirectExtensionIfMissing(specifier, context) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const swap = { ".js": ".ts", ".jsx": ".tsx" };
  for (const [from, to] of Object.entries(swap)) {
    if (!specifier.endsWith(from)) continue;
    let absPath;
    if (specifier.startsWith("/")) {
      absPath = specifier;
    } else if (context.parentURL) {
      const parentPath = fileURLToPath(context.parentURL);
      absPath = pathResolve(dirname(parentPath), specifier);
    } else {
      return null;
    }
    if (!fs.existsSync(absPath)) {
      const swapped = absPath.slice(0, -from.length) + to;
      if (fs.existsSync(swapped)) {
        return specifier.slice(0, -from.length) + to;
      }
    }
  }
  return null;
}

export function resolve(specifier, context, next) {
  const swapped = redirectExtensionIfMissing(specifier, context);
  if (swapped) return next(swapped, context);
  if (
    specifier.startsWith(".") &&
    !specifier.endsWith(".js") &&
    !specifier.endsWith(".jsx") &&
    !specifier.endsWith(".ts") &&
    !specifier.endsWith(".tsx") &&
    !specifier.endsWith(".mjs") &&
    !specifier.endsWith(".json")
  ) {
    const resolved = resolveRelative(specifier, context.parentURL);
    if (resolved) return next(resolved, context);
    // Fall through to .js for backward compat with the original behaviour.
    return next(specifier + ".js", context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".ts")) {
    const path = fileURLToPath(url);
    const source = fs.readFileSync(path, "utf8");
    const { code } = await transform(source, {
      loader: "ts",
      target: "es2022",
      sourcefile: path,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return next(url, context);
}
