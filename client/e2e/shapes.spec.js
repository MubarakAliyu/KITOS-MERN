import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, collectErrors } from "./helpers.js";

/**
 * Every screen in every role, rendered against the real API, with the
 * detail panels opened (Batch 3, production fix).
 *
 * This is the test the instructor's pupil panel needed and did not have.
 * The API sends `{ id, title, deadline }` where the mock fixtures this
 * frontend was built against sent a plain string; the list rendered fine and
 * the panel — behind a button — put an object in a text position and took
 * the whole page down with React error #31. "This page couldn't load", in
 * production, on a screen whose own smoke test was green.
 *
 * Three things follow from that, and this file does all three:
 *
 *   - it loads every screen, not the four easiest ones;
 *   - it **clicks what opens a detail view**, because that is where
 *     populated objects surface and a page that merely loads proves nothing
 *     about them;
 *   - and it fails on a console error, because that is the only trace a
 *     shape mismatch leaves — nothing 500s, nothing is logged server side,
 *     and a human has to be looking at the right screen to notice.
 *
 * `scripts/shape-probe.mjs` is the same sweep as a script, for hunting with
 * readable (unminified) React messages. This is the version CI runs.
 */

const PAGES = {
  student: [
    ["dashboard", "/student"],
    ["courses", "/student/courses"],
    ["assignments", "/student/assignments"],
    ["sessions", "/student/sessions"],
    ["recordings", "/student/recordings"],
    ["certificates", "/student/certificates"],
    ["chat", "/student/chat"],
    ["notifications", "/student/notifications"],
    ["settings", "/student/settings"],
  ],
  parent: [
    ["dashboard", "/parent"],
    ["children", "/parent/children"],
    ["payments", "/parent/payments"],
    ["chat", "/parent/chat"],
    ["notifications", "/parent/notifications"],
    ["settings", "/parent/settings"],
  ],
  instructor: [
    ["dashboard", "/instructor"],
    ["courses", "/instructor/courses"],
    ["students", "/instructor/students"],
    ["assignments", "/instructor/assignments"],
    ["sessions", "/instructor/sessions"],
    ["chat", "/instructor/chat"],
    ["notifications", "/instructor/notifications"],
    ["settings", "/instructor/settings"],
  ],
  admin: [
    ["dashboard", "/admin"],
    ["users", "/admin/users"],
    ["courses", "/admin/courses"],
    ["analytics", "/admin/analytics"],
    ["payments", "/admin/payments"],
    ["sessions", "/admin/sessions"],
    ["attendance", "/admin/sessions/attendance"],
    ["recordings", "/admin/sessions/recordings"],
    ["chat monitor", "/admin/chat"],
    ["notifications", "/admin/notifications"],
    ["settings", "/admin/settings"],
  ],
};

/**
 * Buttons that open a detail view rather than changing something.
 *
 * Reads only: no Delete, Publish or Cancel Subscription, so the suite does
 * not rearrange the seeded database other tests are using.
 */
const OPENERS = ["View details", "View", "Receipt", "Manage Content"];

/**
 * The error boundary's own heading.
 *
 * Checked as well as the console, because a boundary turns a crash into a
 * tidy message — which is the point of it, and would otherwise let exactly
 * the bug this file exists for pass silently.
 */
const BOUNDARY = /this page didn't load/i;

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

test.describe("every screen renders against real data", () => {
  for (const role of Object.keys(ACCOUNTS)) {
    test(`${role}: no screen throws, and no panel does either`, async ({
      page,
    }) => {
      test.setTimeout(PAGES[role].length * 20000 + 60000);

      const errors = collectErrors(page);
      await signIn(page, role);

      for (const [label, route] of PAGES[role]) {
        await page.goto(route);
        await settle(page);

        await expect(
          page.getByText(BOUNDARY),
          `${role} ${label} hit the error boundary on load`
        ).toHaveCount(0);

        for (const name of OPENERS) {
          const buttons = page.getByRole("button", { name, exact: true });
          if ((await buttons.count()) === 0) continue;

          await buttons.first().click().catch(() => {});
          await settle(page);

          await expect(
            page.getByText(BOUNDARY),
            `${role} ${label} hit the error boundary after "${name}"`
          ).toHaveCount(0);

          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(200);
        }
      }

      expect(errors(), `console errors across the ${role} screens`).toEqual([]);
    });
  }
});
