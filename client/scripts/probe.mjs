import { chromium } from "@playwright/test";
const BASE = "http://localhost:3004";
const ACCOUNTS = {
  admin:      { id: "admin@kidsintech.school",      pw: "KIT@admin2025" },
  instructor: { id: "instructor@kidsintech.school", pw: "KIT@teach2025" },
  parent:     { id: "parent@kidsintech.school",     pw: "KIT@parent2025" },
  student:    { id: "KIT/26/001",                   pw: "KIT@learn2025" },
};
const ROUTES = {
  admin: ["/admin","/admin/users","/admin/courses","/admin/analytics","/admin/payments","/admin/notifications","/admin/chat","/admin/settings","/admin/sessions","/admin/sessions/attendance","/admin/sessions/recordings"],
  instructor: ["/instructor","/instructor/courses","/instructor/students","/instructor/assignments","/instructor/chat","/instructor/notifications","/instructor/settings","/instructor/sessions"],
  parent: ["/parent","/parent/children","/parent/payments","/parent/chat","/parent/notifications","/parent/settings"],
  student: ["/student","/student/courses","/student/assignments","/student/certificates","/student/chat","/student/notifications","/student/settings","/student/sessions","/student/recordings"],
};
const bad = new Map(); const errs = [];
for (const [role, acct] of Object.entries(ACCOUNTS)) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:1280,height:900} })).newPage();
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.port === "4000" && r.status() >= 400) {
      const k = `${role}: ${r.request().method()} ${u.pathname} -> ${r.status()}`;
      bad.set(k, (bad.get(k) ?? 0) + 1);
    }
  });
  page.on("pageerror", (e) => errs.push(`${role}: ${e.message}`));
  page.on("console", (m) => { if (m.type()==="error" && !/favicon|DevTools|hydrat/i.test(m.text())) errs.push(`${role} console: ${m.text().slice(0,160)}`); });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="text"]', acct.id);
  await page.fill('input[type="password"]', acct.pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 40000 });
  for (const route of ROUTES[role]) {
    await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(()=>{});
    await page.waitForTimeout(700);
  }
  await browser.close();
  console.log(`${role}: visited ${ROUTES[role].length} routes`);
}
console.log("\n=== FAILING API CALLS ===");
[...bad.entries()].sort().forEach(([k,n]) => console.log(`  ${k}  (x${n})`));
if (bad.size===0) console.log("  none");
console.log("\n=== PAGE / CONSOLE ERRORS ===");
errs.length ? [...new Set(errs)].forEach(e=>console.log("  "+e)) : console.log("  none");
