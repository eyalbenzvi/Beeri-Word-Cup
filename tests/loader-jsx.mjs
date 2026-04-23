// Node ESM loader that resolves bare relative imports (no extension) to .js and
// transforms .jsx files on the fly via esbuild. Used for UI component tests.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

export function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !specifier.endsWith(".js") && !specifier.endsWith(".jsx") && !specifier.endsWith(".json")) {
    return next(specifier + ".js", context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".jsx")) {
    const path = fileURLToPath(url);
    const source = await fs.readFile(path, "utf8");
    const { code } = await transform(source, {
      loader: "jsx",
      jsx: "automatic",
      target: "es2022",
      sourcefile: path,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return next(url, context);
}
