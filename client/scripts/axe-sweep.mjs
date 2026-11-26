/**
 * Every role's main screens, both themes, grouped by what actually failed.
 *
 * The Playwright a11y suite asserts; this one reports. When a sweep turns up
 * a dozen violations, reading them one failing test at a time tells you
 * almost nothing — the same component is usually behind most of them, and
 * what matters is which distinct problems exist, not which pages happen to
 * show them.
 *
 *   node scripts/axe-sweep.mjs            # all roles
 *   node scripts/axe-sweep.mjs parent     # one role
 *
 * Needs the stack up and seeded, same as the Playwright suite.
 */

import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ACCOUNTS, KNOWN_PALETTE_CONTRAST } from "../e2e/helpers.js";

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

const only = process.argv[2];
const roles = only ? [only] : Object.keys(ACCOUNTS);

/**
 * Deliberately a copy of `helpers.signIn`, not a call to it: that one relies
 * on Playwright's `baseURL`, which only exists inside a test run. The
 * account list is still imported, so the credentials cannot drift apart.
 */
async function signIn(page, role) {
  const account = ACCOUNTS[role];

  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email or admission number/i).fill(account.identifier);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(`${account.home}(/|$)`), { timeout: 45000 });
}

async function settle(page, theme) {
  await page.evaluate((next) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  }, theme);

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
  await page.waitForTimeout(1200);
}

/** Already-accepted palette pairs (ADR-020, ADR-029) are not news. */
const exempt = (node) => {
  const summary = (node.failureSummary ?? "").toLowerCase();
  return KNOWN_PALETTE_CONTRAST.some((pair) => summary.includes(pair));
};

const findings = new Map();
const contrastPairs = new Map();

const browser = await chromium.launch();

for (const role of roles) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await signIn(page, role);

  for (const route of PAGES[role]) {
    for (const theme of ["dark", "light"]) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await settle(page, theme);

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      for (const violation of result.violations) {
        if (!["serious", "critical"].includes(violation.impact)) continue;

        const nodes = violation.nodes.filter((node) => !exempt(node));
        if (nodes.length === 0) continue;

        const key = violation.id;
        if (!findings.has(key)) {
          findings.set(key, {
            help: violation.help,
            impact: violation.impact,
            where: new Set(),
            samples: new Set(),
          });
        }
        const entry = findings.get(key);
        entry.where.add(`${route} (${theme})`);

        // Contrast is censused pair by pair, not node by node: a palette
        // problem shows up on dozens of nodes and is really one decision —
        // these two colours together. The distinct pairs are what say how
        // many problems there actually are, and an accepted one joins the
        // exemption list by its exact pair.
        if (key === "color-contrast") {
          for (const node of nodes) {
            const summary = node.failureSummary ?? "";
            const pair = summary.match(
              /foreground color: (#[0-9a-f]{6}), background color: (#[0-9a-f]{6})/i
            );
            if (!pair) continue;

            const id =
              `foreground color: ${pair[1].toLowerCase()}, ` +
              `background color: ${pair[2].toLowerCase()}`;
            if (!contrastPairs.has(id)) {
              contrastPairs.set(id, {
                count: 0,
                where: new Set(),
                ratio: summary.match(/contrast of ([\d.]+)/)?.[1] ?? "?",
              });
            }
            const seen = contrastPairs.get(id);
            seen.count += 1;
            seen.where.add(`${route} (${theme})`);
          }
        }
        for (const node of nodes.slice(0, 2)) {
          const summary = (node.failureSummary ?? "").split("\n").pop()?.trim();
          entry.samples.add(`${node.target.join(" ")}\n      ${summary}`);
        }
      }
    }
    process.stdout.write(".");
  }

  await context.close();
  process.stdout.write(` ${role} done\n`);
}

await browser.close();

if (contrastPairs.size) {
  console.log("\n== Distinct failing colour pairs ==\n");
  const sorted = [...contrastPairs].sort((a, b) => b[1].count - a[1].count);
  for (const [pair, seen] of sorted) {
    console.log(`  "${pair}",`);
    console.log(
      `    ratio ${seen.ratio}, ${seen.count} nodes, e.g. ${[...seen.where][0]}`
    );
  }
}

console.log("\n\n== Distinct violations, excluding the documented palette pairs ==\n");
if (findings.size === 0) {
  console.log("None.");
}
for (const [id, entry] of findings) {
  console.log(`### ${id} [${entry.impact}] — ${entry.help}`);
  console.log(`  on ${entry.where.size} page/theme combinations:`);
  console.log(`    ${[...entry.where].slice(0, 8).join(", ")}`);
  console.log("  examples:");
  for (const sample of [...entry.samples].slice(0, 3)) {
    console.log(`    - ${sample}`);
  }
  console.log("");
}
