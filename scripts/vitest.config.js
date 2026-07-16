import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/test/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/*.test.*",
        "**/*.spec.*",
      ],
      provider: "v8",

      reporter: ["text", "json", "html"],
      thresholds: {
        // branches is lower than the other three: several tie-break branches in the discount
        // reducers (e.g. `cur.idx < best.idx`) are unreachable given how those arrays are built
        // in index order, and the 5 actions with no quote.items dependency have catch blocks
        // that can't be triggered by crafted input alone.
        branches: 65,
        functions: 65,
        lines: 65,
        statements: 65,
      },
    },
    environment: "node",
    globals: true,
  },
});
