import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests (Batch 1 Part G).
 *
 * These run against a real API on a seeded database, not against mocks — the
 * whole point of Batch 1 is that the retained frontend works against the real
 * backend, and a mocked E2E run would prove nothing about that.
 *
 * Start the stack yourself before running:
 *   npm run db:local   (server/)
 *   npm run seed       (server/)
 *   npm run dev        (repository root — API on :4000, client on :3004)
 *
 * CI does the same in .github/workflows/ci.yml.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3004";

export default defineConfig({
  testDir: "./e2e",
  // The suite signs in as four roles and walks their dashboards; serial keeps
  // the shared seeded database predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60000,
  expect: { timeout: 15000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      // The brief asks for a phone too: most KIT parents are on one.
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
