import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["node_modules/", "dist/", "test/"],
      include: ["src/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
      provider: "v8",
      reporter: ["text", "lcov", "html"],
    },
    environment: "node",
    exclude: ["node_modules", "dist"],
    include: ["test/**/*.test.js"],
    server: {
      deps: {
        inline: [
          "@adobe/aio-commerce-lib-app",
          "@adobe/aio-commerce-lib-config",
        ],
      },
    },
    setupFiles: ["./vitest.setup.js"],
    testTimeout: 10_000,
  },
});
