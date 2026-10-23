import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    // One in-memory replica set is shared by the suite (see test/setup.js), so
    // files must not run in parallel against the same collections.
    fileParallelism: false,
    // Starting MongoDB and hashing bcrypt at cost 12 is not fast.
    testTimeout: 60000,
    hookTimeout: 120000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/seed/**", "src/index.js"],
      thresholds: {
        // PRD §4.3: service coverage of 70% or more.
        lines: 70,
        functions: 70,
      },
    },
  },
});
