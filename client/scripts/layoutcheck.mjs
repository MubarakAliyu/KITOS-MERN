/**
 * Proves the brand additions caused no layout shift.
 *
 * Pixel-diffing screenshots is useless here: toasts, count-up animations and
 * "N minutes ago" labels all differ between runs. So measure instead.
 *
 *  1. The sign-in form's position with the attribution present must equal its
 *     position with the attribution removed — i.e. the footer does not push
 *     the form around.
 *  2. The logo now replaces the icon *and* the wordmark beside it, so its own
 *     box is expected to change. What must not change is everything around
 *     it: the sidebar nav's origin, and the form's position.
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3004";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const rect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const withFooter = await rect("main > div");
const lockup = await rect('main img[alt="Kids In Tech"]');

// Remove the attribution and re-measure.
await page.evaluate(() => {
  document.querySelector('a[aria-label="Powered by StarNova Labs"]')?.remove();
});
await page.waitForTimeout(300);
const withoutFooter = await rect("main > div");

console.log("sign-in form, attribution present:", JSON.stringify(withFooter));
console.log("sign-in form, attribution removed:", JSON.stringify(withoutFooter));
console.log(
  "form moved:",
  withFooter.x !== withoutFooter.x || withFooter.y !== withoutFooter.y
    ? `YES  dx=${withoutFooter.x - withFooter.x} dy=${withoutFooter.y - withFooter.y}`
    : "no"
);
console.log("auth logotype box:", JSON.stringify(lockup));

// Sidebar slot, after signing in.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="text"]', "admin@kidsintech.school");
await page.fill('input[type="password"]', "KIT@admin2025");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
await page.waitForTimeout(1500);

const navBefore = await rect("aside nav");
const slot = await rect('aside img[alt="Kids In Tech"]');
await page.evaluate(() => {
  document.querySelector('aside a[aria-label="Powered by StarNova Labs"]')?.remove();
});
await page.waitForTimeout(300);
const navAfter = await rect("aside nav");

console.log("sidebar logotype box:", JSON.stringify(slot));
console.log("sidebar nav, attribution present:", JSON.stringify(navBefore));
console.log("sidebar nav, attribution removed:", JSON.stringify(navAfter));
console.log(
  "nav moved:",
  navBefore.y !== navAfter.y || navBefore.x !== navAfter.x ? "YES" : "no (nav grows/shrinks only in height, which is expected)"
);
console.log("nav height delta:", navAfter.h - navBefore.h);

await browser.close();
