/**
 * Drives the student check-in by hand, through the real UI.
 *
 * The browser pane cannot exercise this properly: BarcodeDetector is absent
 * there, and a camera prompt cannot be answered. So this fetches a real QR
 * token as the instructor, types it into the manual field as the pupil, and
 * checks the register afterwards — which is exactly the fallback path a child
 * on an unsupported browser would take.
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3004";
const API = "http://localhost:4000";

async function token(identifier, password) {
  const response = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identifier, password }),
  });
  const body = await response.json();
  if (!body.access) throw new Error(`login failed for ${identifier}: ${JSON.stringify(body)}`);
  return body.access;
}

async function signIn(page, identifier, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email or admission number/i).fill(identifier);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
  await page.waitForLoadState("networkidle");
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/webpack-hmr|favicon|DevTools/i.test(m.text())) {
    errors.push(m.text().slice(0, 160));
  }
});

// Which session is live, and a token for it.
const instructorToken = await token("instructor@kidsintech.school", "KIT@teach2025");
const sessions = await fetch(`${API}/sessions?filter=live`, {
  headers: { Authorization: `Bearer ${instructorToken}` },
}).then((r) => r.json());

if (sessions.length === 0) throw new Error("no live session in the seed");
const live = sessions[0];
console.log(`live session: ${live.title} (${live.id})`);

const qr = await fetch(`${API}/sessions/${live.id}/qr-token`, {
  method: "POST",
  headers: { Authorization: `Bearer ${instructorToken}` },
}).then((r) => r.json());
console.log(`qr token issued, expires in ${qr.expires_in}s`);

// The pupil.
await signIn(page, "KIT/26/001", "KIT@learn2025");

const banner = page.getByRole("button", { name: /scan to check in/i });
console.log("banner button present:", await banner.count());
await banner.click();

const dialog = page.getByRole("dialog", { name: /check in to this class/i });
await dialog.waitFor({ state: "visible", timeout: 10000 });
console.log("modal opened: true");

// The manual path: no camera needed.
const field = page.locator("#checkin-code");
console.log("manual field present:", await field.count());
await field.fill(qr.token);
await page.getByRole("button", { name: /^check in$/i }).click();

// Appears twice on success: the toast and the modal's confirmation.
await page
  .getByText(/you're checked in/i)
  .first()
  .waitFor({ state: "visible", timeout: 15000 });
console.log("confirmation shown: true");

// And it really reached the register.
const roster = await fetch(`${API}/sessions/${live.id}/roster`, {
  headers: { Authorization: `Bearer ${instructorToken}` },
}).then((r) => r.json());

const liam = roster.students.find((s) => s.admission_no === "KIT/26/001");
console.log(`register: ${liam?.name} -> ${liam?.status} via ${liam?.method}`);

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
