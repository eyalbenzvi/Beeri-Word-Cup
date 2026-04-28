import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config — co-exists with the legacy ./tests/run-all.sh harness
// during the migration. Two important guards:
//
// 1. `include` is restricted to `*.test.{js,jsx}` so Vitest will NOT
//    try to run the legacy `tests/test-*.mjs` files. The legacy suite
//    has its own `assert(c, m)` style and Node-strict ESM expectations
//    that wouldn't survive Vitest's auto-import / globals.
//
// 2. `globals: true` exposes `describe`, `it`, `expect` without an
//    import in every test file — matches the convention contributors
//    expect from Vitest/Jest.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/vitest.setup.js"],
    include: [
      "src/**/*.test.{js,jsx,ts,tsx}",
      "tests/vitest/**/*.test.{js,jsx,ts,tsx}",
    ],
    exclude: ["node_modules", "dist", ".netlify"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/types.d.ts"],
    },
  },
});
