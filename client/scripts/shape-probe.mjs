/**
 * Hunts for mock-vs-API shape mismatches across all four roles.
 *
 * The instructor's pupil panel blanked with React error #31 — an object in a
 * text position — because the API sends `{ id, title, deadline }` where the
 * mock fixtures sent a plain string. That class of bug is invisible to the
 * server suite, survives a page that merely *loads*, and often hides behind
 * a button: the list rendered fine and the panel killed it.
 *
 * So this walks every screen, then clicks the things that open a detail
 * view, and reports every console error with the screen and action that
 * produced it. A React error is minified in a production build, so it runs
 * against the dev server where the message is readable.
 *
 *   node scripts/shape-probe.mjs            # all roles
 *   node scripts/shape-probe.mjs instructor # one
 */

import { chromium } from "@playwright/test";
import { ACCOUNTS } from "../e2e/helpers.js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3004";

const PAGES = {
  student: [
    "/student",
    "/student/courses",
    "/student/assignments",
    "/student/sessions",
    "/student/recordings",
    "/student/certificates",
    "/student/chat",
    "/student/notifications",
    "/student/settings",
  ],
  parent: [
    "/parent",
    "/parent/children",
    "/parent/payments",
    "/parent/chat",
    "/parent/notifications",
    "/parent/settings",
  ],
  instructor: [
    "/instructor",
    "/instructor/courses",
    "/instructor/students",
    "/instructor/assignments",
    "/instructor/sessions",
    "/instructor/chat",
    "/instructor/notifications",
    "/instructor/settings",
  ],
  admin: [
    "/admin",
    "/admin/users",
    "/admin/courses",
    "/admin/analytics",
    "/admin/payments",
    "/admin/sessions",
    "/admin/sessions/attendance",
    "/admin/sessions/recordings",
    "/admin/chat",
    "/admin/notifications",
    "/admin/settings",
  ],
};

/**
 * Buttons that open a detail view rather than changing data.
 *
 * Deliberately not "Delete", "Publish", "Cancel Subscription" and the like:
 * the probe reads, it does not rearrange the seeded database underneath
 * itself. "View" and "Receipt" open panels and modals, which is where the
 * populated objects surface.
 */
const OPENERS = [
  "View details",
  "View",
  "Receipt",
  "Manage Content",
  "Open",
];

/** Noise that says nothing about the app's own shapes. */
const IGNORE =
  /_next\/hmr|favicon|Download the React DevTools|hydrat|ResizeObserver|socket\.io|WebSocket connection/i;

const findings = [];

function watch(page, where) {
  const seen = new Set();
  const record = (text) => {
    if (IGNORE.test(text)) return;
    if (seen.has(text)) return;
    seen.add(text);
    findings.push({ ...where(), text });
  };
  page.on("console", (m) => {
    if (m.type() === "error") record(m.text());
  });
  page.on("pageerror", (e) => record(`Uncaught: ${e.message}`));
}

async function signIn(page, role) {
  const account = ACCOUNTS[role];
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email or admission number/i).fill(account.identifier);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(`${account.home}(/|$)`), { timeout: 45000 });
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
}

const only = process.argv[2];
const roles = only ? [only] : Object.keys(PAGES);

const browser = await chromium.launch();

for (const role of roles) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  let current = { role, route: "(sign-in)", action: "load" };
  watch(page, () => ({ ...current }));

  await signIn(page, role);

  for (const route of PAGES[role]) {
    current = { role, route, action: "load" };
    await page.goto(`${BASE}${route}`);
    await settle(page);

    // Then open what can be opened. Each opener is tried once; a panel that
    // crashes takes the page with it, so the page is reloaded between them.
    for (const name of OPENERS) {
      const buttons = page.getByRole("button", { name, exact: true });
      const count = await buttons.count().catch(() => 0);
      if (count === 0) continue;

      current = { role, route, action: `click "${name}"` };
      await buttons.first().click().catch(() => {});
      await settle(page);

      // Close whatever opened, so the next opener is reachable.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(250);
    }

    process.stdout.write(".");
  }

  await context.close();
  process.stdout.write(` ${role}\n`);
}

await browser.close();

console.log(`\n\n════ ${findings.length} console error(s) ════\n`);
if (findings.length === 0) {
  console.log("None.");
}
for (const f of findings) {
  console.log(`${f.role.padEnd(11)} ${f.route.padEnd(32)} ${f.action}`);
  console.log(`    ${f.text.split("\n")[0].slice(0, 200)}`);
}
