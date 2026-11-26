/**
 * Every role's key screens, in both themes, into `docs/screenshots/`
 * (Batch 3 Part G).
 *
 *   npm run screenshots                       # local, http://localhost:3004
 *   E2E_BASE_URL=https://… npm run screenshots  # the deployed site
 *
 * These go into the report and the slides, so they are captured by a script
 * rather than by hand: a hand-taken set drifts — different window sizes,
 * one theme missing, a stale screen nobody re-took after a change. Re-running
 * this regenerates all of them at one size from one seeded database.
 *
 * `scripts/screenshots.mjs` is a different thing and stays: it is the Batch 1
 * before/after pair for the brand swap, which is a historical comparison, not
 * a current view of the product.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ACCOUNTS } from "../e2e/helpers.js";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3004").replace(
  /\/$/,
  ""
);
const OUT = path.resolve(process.cwd(), "..", "docs", "screenshots");

/** The screens worth putting in a report: one per thing the system does. */
const SHOTS = {
  student: [
    ["dashboard", "/student"],
    ["courses", "/student/courses"],
    ["assignments", "/student/assignments"],
    ["sessions", "/student/sessions"],
    ["certificates", "/student/certificates"],
    ["chat", "/student/chat"],
  ],
  parent: [
    ["dashboard", "/parent"],
    ["children", "/parent/children"],
    ["payments", "/parent/payments"],
    ["chat", "/parent/chat"],
  ],
  instructor: [
    ["dashboard", "/instructor"],
    ["courses", "/instructor/courses"],
    ["students", "/instructor/students"],
    ["sessions", "/instructor/sessions"],
    ["assignments", "/instructor/assignments"],
  ],
  admin: [
    ["dashboard", "/admin"],
    ["users", "/admin/users"],
    ["courses", "/admin/courses"],
    ["analytics", "/admin/analytics"],
    ["payments", "/admin/payments"],
    ["sessions", "/admin/sessions"],
    ["settings", "/admin/settings"],
  ],
};

const THEMES = ["dark", "light"];

/**
 * The dev-tools indicator sits bottom-left, exactly where the sidebar's
 * "Powered by StarNova Labs" is — so without this it covers one of the two
 * brand marks these screenshots exist to show. Absent from a production
 * build, harmless there.
 */
async function hideDevOverlay(page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important; }",
    })
    .catch(() => {});
}

async function applyTheme(page, theme) {
  await page.evaluate((next) => {
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private mode, or storage blocked. The class below is what matters.
    }
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    document.documentElement.setAttribute("data-theme", next);
  }, theme);
}

/** Wait for the page to stop moving, so no shot catches a half-faded card. */
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll(".skeleton-shimmer")].every(
          (node) => node.offsetParent === null
        ),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {});
  await page
    .addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important; transition: none !important; }`,
    })
    .catch(() => {});
  await page.waitForTimeout(900);
}

async function signIn(page, role) {
  const account = ACCOUNTS[role];
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email or admission number/i).fill(account.identifier);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(`${account.home}(/|$)`), { timeout: 45000 });
}

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let count = 0;

// The sign-in page carries both brand marks, so it is captured first and in
// both themes — it is the single most-used image in the report.
for (const theme of THEMES) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await applyTheme(page, theme);
  await hideDevOverlay(page);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `login-${theme}.png`) });
  count += 1;
  await context.close();
}

for (const [role, shots] of Object.entries(SHOTS)) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: theme,
    });
    const page = await context.newPage();

    await signIn(page, role);
    await applyTheme(page, theme);
    await hideDevOverlay(page);

    for (const [label, route] of shots) {
      await page.goto(`${BASE}${route}`);
      await applyTheme(page, theme);
      await settle(page);
      await page.screenshot({
        path: path.join(OUT, `${role}-${label}-${theme}.png`),
      });
      count += 1;
      process.stdout.write(".");
    }

    await context.close();
  }
  process.stdout.write(` ${role}\n`);
}

// One phone-width shot per role: most KIT parents are on a phone, and a
// report that only shows a 1280px desktop is not showing the real product.
for (const role of Object.keys(SHOTS)) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await signIn(page, role);
  await applyTheme(page, "dark");
  await hideDevOverlay(page);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${role}-mobile-dark.png`) });
  count += 1;
  await context.close();
}

await browser.close();
console.log(`\n${count} screenshots written to ${OUT}`);
