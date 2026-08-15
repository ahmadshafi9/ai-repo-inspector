import { defineConfig } from "vitest/config";

// Restrict discovery to the TypeScript sources under test/.
// Without this, a previous `npm run build` leaves compiled copies in dist/test/,
// vitest's default glob picks them up, and every test runs twice. CI runs
// typecheck -> build -> test, so this is the default path, not an edge case.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
