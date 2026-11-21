/**
 * Prints the exact colour pairs failing axe on one screen.
 *
 * The suite reports which nodes failed but not what they are, and the
 * exemption in e2e/helpers.js is matched per node by exact colour pair — so
 * deciding whether a new failure is a palette pair already accepted under
 * ADR-020, or something genuinely new, needs the pairs themselves.
 *
 *   node scripts/axe-probe.mjs <role> <path>
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = "http://localhost:3004";

const ACCOUNTS = {
  admin: ["admin@kidsintech.school", "KIT@admin2025"],
  instructor: ["instructor@kidsintech.school", "KIT@teach2025"],
  parent: ["parent@kidsintech.school", "KIT@parent2025"],
  student: ["KIT/26/001", "KIT@learn2025"],
};

const role = process.argv[2] ?? "parent";
const route = process.argv[3] ?? `/${role}`;
const [identifier, password] = ACCOUNTS[role];

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 900 } })
).newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel(/email or admission number/i).fill(identifier);
await page.getByLabel(/^password$/i).fill(password);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });

await page.goto(BASE + route, { waitUntil: "networkidle" });

// Same settling the suite does: scanning mid-transition samples half-faded
// colours and invents failures that vanish once the page is at rest.
await page.addStyleTag({
  content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
});
await page.waitForTimeout(800);

const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  .analyze();

for (const violation of results.violations) {
  if (!["serious", "critical"].includes(violation.impact)) continue;
  console.log(`\n[${violation.impact}] ${violation.id}: ${violation.help}`);
  for (const node of violation.nodes) {
    const pair = (node.failureSummary ?? "").match(
      /foreground color: (#[0-9a-f]+), background color: (#[0-9a-f]+)/i
    );
    console.log(`  ${node.target.join(" ")}`);
    console.log(`    ${pair ? `${pair[1]} on ${pair[2]}` : node.failureSummary?.slice(0, 160)}`);
    console.log(`    ${node.html.slice(0, 140)}`);
  }
}

if (results.violations.filter((v) => ["serious", "critical"].includes(v.impact)).length === 0) {
  console.log("No serious or critical violations.");
}

await browser.close();
