/**
 * Checks that the screens which should now hold Batch 2 data actually show
 * it.
 *
 * The route probe only proves nothing errored. A screen that quietly renders
 * its empty state because a field name does not match would pass that and
 * still be broken, which is the failure mode worth catching after wiring a
 * frontend to a real API.
 *
 * Each row asserts a phrase that can only come from real seeded data, and
 * that the screen is *not* showing its empty state.
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3004";

const ACCOUNTS = {
  admin: { id: "admin@kidsintech.school", pw: "KIT@admin2025" },
  instructor: { id: "instructor@kidsintech.school", pw: "KIT@teach2025" },
  parent: { id: "parent@kidsintech.school", pw: "KIT@parent2025" },
  student: { id: "KIT/26/001", pw: "KIT@learn2025" },
};

/** `expect` phrases must all appear; `absent` phrases must not. */
const CHECKS = {
  student: [
    { route: "/student", expect: ["Liam"], absent: [] },
    { route: "/student/courses", expect: ["Scratch Programming", "Web Development"], absent: ["No courses"] },
    // The screen opens on its Pending tab, so the pending brief is the one
    // that must show; the graded one lives behind the Reviewed tab.
    { route: "/student/assignments", expect: ["Build Your Profile Page"], absent: [] },
    { route: "/student/certificates", expect: ["Scratch Programming"], absent: [] },
    { route: "/student/sessions", expect: ["Scratch Programming"], absent: [] },
    { route: "/student/recordings", expect: ["Scratch"], absent: [] },
  ],
  parent: [
    { route: "/parent", expect: ["Liam"], absent: [] },
    { route: "/parent/children", expect: ["Liam Hassan", "Aisha Hassan"], absent: [] },
  ],
  instructor: [
    { route: "/instructor/courses", expect: ["Scratch Programming", "Web Development"], absent: [] },
    { route: "/instructor/students", expect: ["Liam Hassan"], absent: ["No students"] },
    { route: "/instructor/assignments", expect: ["Build a Simple Animation"], absent: [] },
    { route: "/instructor/sessions", expect: ["Scratch Programming"], absent: [] },
  ],
  admin: [
    { route: "/admin/users", expect: ["Liam Hassan", "KIT/26/001"], absent: [] },
    { route: "/admin/courses", expect: ["Scratch Programming", "Robotics"], absent: [] },
    { route: "/admin/sessions", expect: ["Scratch Programming"], absent: [] },
    { route: "/admin/sessions/recordings", expect: ["Scratch"], absent: [] },
  ],
};

async function signIn(page, acct) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email or admission number/i).fill(acct.id);
  await page.getByLabel(/^password$/i).fill(acct.pw);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
}

let failures = 0;

for (const [role, checks] of Object.entries(CHECKS)) {
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();

  await signIn(page, ACCOUNTS[role]);

  for (const check of checks) {
    await page.goto(BASE + check.route, { waitUntil: "networkidle" });
    // Let the lists settle; several fetch after mount.
    await page.waitForTimeout(1200);
    const text = await page.innerText("body");

    const missing = check.expect.filter((phrase) => !text.includes(phrase));
    const present = check.absent.filter((phrase) => text.includes(phrase));

    if (missing.length === 0 && present.length === 0) {
      console.log(`  ok    ${check.route}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${check.route}`);
      if (missing.length) console.log(`          missing: ${missing.join(", ")}`);
      if (present.length) console.log(`          unexpectedly present: ${present.join(", ")}`);
    }
  }

  await browser.close();
  console.log(`${role}: done`);
}

console.log(failures === 0 ? "\nAll content checks passed." : `\n${failures} content check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
