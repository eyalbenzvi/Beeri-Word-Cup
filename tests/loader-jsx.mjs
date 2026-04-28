// Node ESM loader for the legacy harness — JSX/TSX-aware variant.
//
// Resolves bare relative imports (no extension) to whichever of
// .js / .jsx / .ts / .tsx exists, and transforms .jsx / .ts / .tsx on
// the fly via esbuild. Used by tests that import a real React component
// or any TypeScript source.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
import { transform } from "esbuild";

const RESOLVE_EXTS = [".js", ".jsx", ".ts", ".tsx", ".json"];

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

// See loader.mjs for the rationale — same trick, also covers .jsx -> .tsx.
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
    return next(specifier + ".js", context);
  }
  return next(specifier, context);
}

const ESBUILD_LOADERS = {
  ".jsx": "jsx",
  ".ts": "ts",
  ".tsx": "tsx",
};

export async function load(url, context, next) {
  for (const [ext, loaderName] of Object.entries(ESBUILD_LOADERS)) {
    if (url.endsWith(ext)) {
      const path = fileURLToPath(url);
      const source = fs.readFileSync(path, "utf8");
      const { code } = await transform(source, {
        loader: loaderName,
        jsx: "automatic",
        target: "es2022",
        sourcefile: path,
      });
      return { format: "module", source: code, shortCircuit: true };
    }
  }
  return next(url, context);
}
