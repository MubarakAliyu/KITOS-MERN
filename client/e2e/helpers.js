import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Shared E2E helpers.
 *
 * Credentials are the seeded development ones (client/src/HANDOFF.md). They
 * only ever reach a local or CI database.
 */
export const ACCOUNTS = {
  admin: {
    identifier: "admin@kidsintech.school",
    password: "KIT@admin2025",
    home: "/admin",
    heading: /admin dashboard/i,
  },
  instructor: {
    identifier: "instructor@kidsintech.school",
    password: "KIT@teach2025",
    home: "/instructor",
    heading: /dashboard/i,
  },
  parent: {
    identifier: "parent@kidsintech.school",
    password: "KIT@parent2025",
    home: "/parent",
    heading: /dashboard/i,
  },
  student: {
    identifier: "KIT/26/001",
    password: "KIT@learn2025",
    home: "/student",
    heading: /dashboard/i,
  },
};

/**
 * Signs in and waits for the role's dashboard.
 *
 * The sign-in form takes an email or an admission number in the same field,
 * so one helper serves all four roles.
 */
export async function signIn(page, role) {
  const account = ACCOUNTS[role];

  await page.goto("/login");
  await page.getByLabel(/email or admission number/i).fill(account.identifier);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(new RegExp(`${account.home}(/|$)`), { timeout: 45000 });
  return account;
}

/**
 * Signs out and signs in as another role, in the same tab.
 *
 * The journeys follow one piece of work through several pairs of hands, so
 * they change role repeatedly. The session lives in a cookie and the access
 * token is read from it per request, so clearing cookies is a real sign-out —
 * nothing of the previous role survives into the next.
 */
export async function switchTo(page, role) {
  await page.context().clearCookies();
  return signIn(page, role);
}

/**
 * Returns the sidebar, opening it first on a narrow viewport.
 *
 * Below the `md` breakpoint the sidebar is an overlay that starts closed, so a
 * test that just looks for `aside` finds the hidden desktop copy and fails on
 * a phone. The topbar's "Toggle sidebar" button is the real way in.
 */
export async function openSidebar(page) {
  const toggle = page.getByRole("button", { name: /toggle sidebar/i });

  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    // The overlay springs in; wait for it to be settled and interactive.
    await page.waitForTimeout(500);
  }

  return page.locator("aside:visible").first();
}

/**
 * Collects console errors and page exceptions for a test.
 *
 * Returns a getter rather than an array so a test reads the final state after
 * navigation, and filters noise that is not the application's fault: a dev
 * server's HMR chatter, and favicon requests on routes that do not serve one.
 */
export function collectErrors(page) {
  const errors = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Download the React DevTools|hydrat/i.test(text)) return;
    errors.push(text);
  });

  page.on("pageerror", (error) => {
    errors.push(`Uncaught: ${error.message}`);
  });

  return () => errors;
}

/**
 * Contrast pairs that come from the palette, not from this batch.
 *
 * Every one of these is a colour the retained design or a third-party
 * component chose, and none can be fixed without changing colours — which
 * CLAUDE.md makes non-negotiable and PRD §4.2 rules out. They are recorded in
 * ADR-020 as an open brand decision and carried in docs/PROGRESS.md:
 *
 *   white on the brand emerald          2.53:1   badges, chips, primary buttons
 *   pale mint on the brand emerald      1.90:1   button sub-labels
 *   white on red-500                    3.x:1    the unread notification badge
 *   Sonner's success green on its mint  4.25:1   toast, third-party default
 *   --text-muted on dark surfaces       3.69:1   secondary text in dark theme
 *
 * Matching is per node and by exact colour pair, so this cannot quietly
 * swallow anything else: a contrast failure involving any other pair, or any
 * other serious or critical rule, still fails the build.
 */
export const KNOWN_PALETTE_CONTRAST = [
  "foreground color: #ffffff, background color: #10b981",
  "foreground color: #b7ead9, background color: #10b981",
  "foreground color: #ffffff, background color: #fb2c36",
  "foreground color: #008a2e, background color: #ecfdf3",
  "foreground color: #6b7280, background color: #111827",
  "foreground color: #6b7280, background color: #1a2234",
  // Emerald used as text on white — the "Forgot password?" link.
  "foreground color: #10b981, background color: #ffffff",
  // The amber pending-enrolment card: a 15% overlay, so the computed
  // background is a blend of amber-500 and the dark surface beneath it.
  "foreground color: #e17100, background color: #3f311f",
  "foreground color: #6b7280, background color: #1d1e25",
];

function isKnownPaletteNode(node) {
  const summary = (node.failureSummary ?? "").toLowerCase();
  return KNOWN_PALETTE_CONTRAST.some((pair) => summary.includes(pair));
}

export async function expectNoSeriousAxeViolations(page, label) {
  // The dashboards fade in with motion/react. Scanning mid-transition samples
  // half-faded colours and invents contrast failures that vanish once the
  // page is at rest, so settle it first.
  await page
    .addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }`,
    })
    .catch(() => {});
  await page.waitForTimeout(600);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => {
      if (violation.id !== "color-contrast") return violation;
      // Drop only the known pairs; keep the violation if anything else
      // inside it still fails.
      const nodes = violation.nodes.filter((node) => !isKnownPaletteNode(node));
      return { ...violation, nodes };
    })
    .filter((violation) => violation.nodes.length > 0);

  if (blocking.length > 0) {
    const detail = blocking
      .map(
        (violation) =>
          `  [${violation.impact}] ${violation.id}: ${violation.help}\n` +
          violation.nodes
            .slice(0, 3)
            .map((node) => `      ${node.target.join(" ")}`)
            .join("\n")
      )
      .join("\n");
    throw new Error(`axe found serious/critical violations on ${label}:\n${detail}`);
  }

  expect(blocking).toHaveLength(0);
}
