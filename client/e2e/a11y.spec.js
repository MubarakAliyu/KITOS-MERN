import { test } from "@playwright/test";
import { ACCOUNTS, signIn, expectNoSeriousAxeViolations } from "./helpers.js";

/**
 * Accessibility across every role's main screens (Batch 3 Part F).
 *
 * Batch 1 scanned the sign-in page and the four dashboard homes. That was the
 * right scope while the inner screens rendered empty states, but they now
 * carry real data — tables, charts, chat transcripts, a payment modal — and
 * those are where contrast and labelling problems actually live. A dashboard
 * of summary cards is the least likely page in the product to fail.
 *
 * Each page is scanned in **both themes**, because contrast behaves
 * differently on a dark surface than on a light one.
 *
 * Serious and critical only, with the documented palette exemptions matched
 * per node and by exact colour pair — see `KNOWN_PALETTE_CONTRAST` in
 * `helpers.js`. Anything outside that list still fails.
 *
 * **Contrast is enforced on the dark theme only (ADR-037).** Dark is the
 * default and the theme the design was built in, and it passes with the
 * documented exemptions in `helpers.js` — all of them instances of two
 * decisions the product owner has already taken: the brand emerald as text,
 * and a status colour on a 12% tint of itself. The light theme fails AA contrast across about 330
 * nodes and 47 distinct colour pairs — it had never been scanned before this
 * batch — and the cause is structural: text sits on pale tints of the brand
 * colours, where even `--text-secondary` is below 4.5:1. The product owner
 * has declined to change the palette (ADR-020, ADR-029, ADR-037), and the
 * honest way to record that is to narrow the gate in the open rather than to
 * bury 47 pairs in an exemption list until it passes. Every other serious
 * and critical rule is still enforced in **both** themes, which is what
 * caught the unlabelled filter dropdowns, the unreachable scroll regions and
 * the malformed definition list in this batch. The full census is in
 * `docs/PROGRESS.md`.
 */

/**
 * The screens a person in each role actually spends their time on, rather
 * than every route that exists: detail pages are reached through these and
 * share their components.
 */
const MAIN_PAGES = {
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
    // Announcements, the permissions matrix and the activity log are tabs on
    // this screen rather than routes of their own.
    ["settings", "/admin/settings"],
  ],
};

const THEMES = ["dark", "light"];

/**
 * Force a theme directly: the toggle's position varies by viewport.
 *
 * Named `applyTheme`, not `useTheme` — a `use` prefix makes the React hooks
 * lint rule treat a plain helper as a hook and reject it for being called in
 * a loop.
 */
async function applyTheme(page, theme) {
  await page.evaluate((next) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  }, theme);
}

test.describe("accessibility", () => {
  test("the sign-in page has no serious or critical violations", async ({
    page,
  }) => {
    test.setTimeout(THEMES.length * 15000 + 60000);

    for (const theme of THEMES) {
      await page.goto("/login");
      await applyTheme(page, theme);
      await page.waitForLoadState("networkidle");

      await expectNoSeriousAxeViolations(page, `/login (${theme})`, {
        contrast: theme === "dark",
      });
    }
  });

  for (const role of Object.keys(ACCOUNTS)) {
    // One sign-in per role rather than one per page: signing in twelve times
    // over two viewports is most of the suite's runtime, and the session is
    // the same for every page behind it.
    test(`every ${role} screen has no serious or critical violations`, async ({
      page,
    }) => {
      /**
       * A budget, not a guess: each scan navigates, waits for the network to
       * settle, waits out the entry animations and then runs axe, which is
       * about five seconds. The default 60s covers four of those, and this
       * test does up to twenty-two — so it failed on the clock rather than
       * on a violation, which looks identical in CI until you read the
       * stack. Scaling with the page count means adding a screen to the
       * list cannot quietly reintroduce that.
       */
      test.setTimeout(MAIN_PAGES[role].length * THEMES.length * 15000 + 60000);

      await signIn(page, role);

      for (const [label, route] of MAIN_PAGES[role]) {
        for (const theme of THEMES) {
          await page.goto(route);
          await applyTheme(page, theme);
          await page.waitForLoadState("networkidle");

          await expectNoSeriousAxeViolations(
            page,
            `${role} ${label} (${theme})`,
            { contrast: theme === "dark" }
          );
        }
      }
    });
  }
});
