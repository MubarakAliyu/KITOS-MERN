/**
 * Renders the certificate PDF through the real UI.
 *
 * The brand change to CertificateDocument adds two <Image> elements, and
 * @react-pdf/renderer fails at render time if an image cannot be fetched — so
 * this drives the actual download button rather than trusting the markup.
 * The certificates endpoint is stubbed with one row, because certificates are
 * issued in Batch 2 and the Batch 1 database has none.
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? ".";
const BASE = "http://localhost:3004";

const CERT = {
  id: "cert-demo-0001",
  course_title: "Scratch Programming",
  student_name: "Liam Hassan",
  completion_date: "2026-04-27T00:00:00.000Z",
  score_average: 92,
  issued_by: "StarNova Labs",
  course_duration: "12 weeks",
  instructor_name: "Ms. Sarah Aliyu",
  is_unlocked: true,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.route("http://localhost:4000/certificates*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([CERT]) })
);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="text"]', "KIT/26/001");
await page.fill('input[type="password"]', "KIT@learn2025");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });

await page.goto(`${BASE}/student/certificates`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const bodyText = await page.innerText("body");
console.log("certificate row rendered:", bodyText.includes("Scratch Programming"));

// Find and click a download control.
const btn = page.getByRole("button", { name: /download/i }).first();
const count = await page.getByRole("button", { name: /download/i }).count();
console.log("download controls found:", count);

if (count > 0) {
  const waitDownload = page.waitForEvent("download", { timeout: 45000 }).catch(() => null);
  await btn.click();
  const dl = await waitDownload;
  if (dl) {
    const file = path.join(OUT_DIR, "certificate-after.pdf");
    await dl.saveAs(file);
    console.log("PDF saved:", file);
  } else {
    console.log("No download event fired.");
  }
}

console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
