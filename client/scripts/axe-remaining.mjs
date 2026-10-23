import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Imported, not copied: a second list would drift from the one the suite
// actually enforces.
import { KNOWN_PALETTE_CONTRAST } from "../e2e/helpers.js";

const known = (n) =>
  KNOWN_PALETTE_CONTRAST.some((p) =>
    (n.failureSummary ?? "").toLowerCase().includes(p)
  );

const BASE = "http://localhost:3004";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

async function scan(label) {
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }).catch(()=>{});
  await page.waitForTimeout(800);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  const remaining = r.violations
    .filter((v) => ["serious","critical"].includes(v.impact))
    .map((v) => v.id === "color-contrast" ? { ...v, nodes: v.nodes.filter((n) => !known(n)) } : v)
    .filter((v) => v.nodes.length > 0);
  console.log(`\n### ${label} — ${remaining.length} remaining`);
  for (const v of remaining) {
    console.log(`  [${v.impact}] ${v.id}`);
    for (const n of v.nodes.slice(0,5)) {
      console.log(`    ${n.target.join(" ")}`);
      console.log(`      ${(n.failureSummary ?? "").replace(/\n/g," | ").slice(0,200)}`);
    }
  }
}

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await scan("/login");

await page.getByLabel(/email or admission number/i).fill("admin@kidsintech.school");
await page.getByLabel(/^password$/i).fill("KIT@admin2025");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/\/admin/, { timeout: 45000 });
await page.waitForLoadState("networkidle");
await scan("admin dashboard");

await browser.close();
