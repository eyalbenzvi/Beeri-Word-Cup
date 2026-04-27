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

export function resolve(specifier, context, next) {
  if (
    specifier.startsWith(".") &&
    !specifier.endsWith(".js") &&
    !specifier.endsWith(".jsx") &&
    !specifier.endsWith(".ts") &&
    !specifier.endsWith(".tsx") &&
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
