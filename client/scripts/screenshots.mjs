// Screenshot helper for the Batch 1 before/after brand comparison.
// Usage: node shots.mjs <before|after> <outDir>
import { chromium, devices } from "@playwright/test";
import path from "node:path";

const phase = process.argv[2] ?? "before";
const outDir = process.argv[3];
const BASE = "http://localhost:3004";

const ACCOUNTS = {
  admin:      { id: "admin@kidsintech.school",      pw: "KIT@admin2025",  home: "/admin" },
  instructor: { id: "instructor@kidsintech.school", pw: "KIT@teach2025",  home: "/instructor" },
  parent:     { id: "parent@kidsintech.school",     pw: "KIT@parent2025", home: "/parent" },
  student:    { id: "KIT/26/001",                   pw: "KIT@learn2025",  home: "/student" },
};

async function signIn(page, acct) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="identifier"], input#identifier, input[type="text"]', acct.id);
  await page.fill('input[type="password"]', acct.pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Hides the Next.js dev-tools indicator.
 *
 * It is a dev-only affordance pinned to the bottom-left corner, which is
 * exactly where the sidebar's "Powered by StarNova Labs" sits — so without
 * this it covers the thing these screenshots exist to show. It is absent from
 * a production build.
 */
async function hideDevOverlay(page) {
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important; }",
  }).catch(() => {});
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(400);
}

const errors = [];

for (const theme of ["light", "dark"]) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${theme}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${theme}] pageerror: ${e.message}`));

  // Login page
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await setTheme(page, theme);
  await page.reload({ waitUntil: "networkidle" });
  await setTheme(page, theme);
  await hideDevOverlay(page);
  await page.screenshot({ path: path.join(outDir, `${phase}-login-${theme}-1280.png`), fullPage: false });

  // Admin dashboard (sidebar)
  await signIn(page, ACCOUNTS.admin);
  await setTheme(page, theme);
  await hideDevOverlay(page);
  // The stat tiles count up from zero on mount; capture after they settle so
  // the figures in the evidence are the real ones.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, `${phase}-admin-sidebar-${theme}-1280.png`) });

  await browser.close();
}

// Mobile 375 + tablet 768, light only
for (const [label, width] of [["375", 375], ["768", 768]]) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await hideDevOverlay(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${phase}-login-light-${label}.png`) });
  await browser.close();
}

console.log(`${phase}: screenshots written to ${outDir}`);
if (errors.length) { console.log("CONSOLE ERRORS:"); errors.forEach((e) => console.log("  " + e)); }
else console.log("No console errors.");
