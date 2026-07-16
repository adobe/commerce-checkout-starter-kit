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
        branches: 60,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    environment: "node",
    globals: true,
  },
});
