import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = "http://localhost:3004";
const ACCOUNTS = {
  admin: ["admin@kidsintech.school", "KIT@admin2025", "/admin"],
  instructor: ["instructor@kidsintech.school", "KIT@teach2025", "/instructor"],
  parent: ["parent@kidsintech.school", "KIT@parent2025", "/parent"],
  student: ["KIT/26/001", "KIT@learn2025", "/student"],
};

async function settle(page) {
  // The dashboards fade in with motion/react. Scanning during the transition
  // samples half-faded colours and reports contrast failures that do not
  // exist once the page is at rest.
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important;
      transition: none !important; opacity: 1 !important; }`,
  }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function scan(page, label) {
  await settle(page);
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  console.log(`\n### ${label} — ${bad.length} serious/critical`);
  for (const v of bad) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`      ${n.target.join(" ")}`);
      if (n.failureSummary) console.log(`        ${n.failureSummary.replace(/\n/g, " | ").slice(0, 220)}`);
    }
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await scan(page, "/login");

for (const [role, [id, pw, home]] of Object.entries(ACCOUNTS)) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email or admission number/i).fill(id);
  await page.getByLabel(/^password$/i).fill(pw);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(new RegExp(home), { timeout: 45000 });
  await page.waitForLoadState("networkidle");
  await scan(page, `${role} dashboard`);
}
await browser.close();
