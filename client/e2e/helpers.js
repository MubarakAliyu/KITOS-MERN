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
 *   the teal "In Progress" chip         3.x:1    on a 12% tint of itself
 *
 * Batch 3 widened the scan from four dashboards to all 34 main screens and
 * added twelve more pairs (ADR-037). Every one is another instance of two
 * patterns already accepted above — `--text-muted` on a dark surface, and a
 * status colour on a 12% tint of itself — on screens that had simply never
 * been scanned. No new kind of failure appeared, which is the only reason
 * the list was allowed to grow rather than the screens being changed.
 *
 * Matching is per node and by exact colour pair, so this cannot quietly
 * swallow anything else: a contrast failure involving any other pair, or any
 * other serious or critical rule, still fails the build. The light theme is
 * a separate matter and is **not** handled by adding pairs here — see
 * `expectNoSeriousAxeViolations` and ADR-037.
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
  // The "In Progress" chip on a child's course card: the retained design's
  // teal on a 12% tint of itself. Unreachable until this batch, because
  // progress was a hard-coded empty array and every card read "Not Started".
  "foreground color: #0ea5a5, background color: #193242",

  // ── Batch 3: the same two patterns, on screens not previously scanned ──
  //
  // (`--text-muted` on a dark surface is handled by `isMutedOnDark` below
  // rather than listed here — there is one such pair per card tint, and
  // enumerating them was a list that grew every time a screen was added.)
  //
  // A status colour as text on a 12% tint of itself, continued — the same
  // chip pattern as the teal one above, in the design's other five hues.
  // Red: a falling trend arrow, a cancelled session, an overdue badge.
  "foreground color: #ef4444, background color: #1a2234",
  "foreground color: #fb2c36, background color: #1a2234",
  "foreground color: #dc2626, background color: #1a2234",
  "foreground color: #dc2626, background color: #2d2233",
  // Blue: the "one-time payment" and role chips.
  "foreground color: #3b82f6, background color: #1e2e4b",
  // Violet: the admin role chip and the activity-log kind marker.
  "foreground color: #8b5cf6, background color: #28294b",
  "foreground color: #ad46ff, background color: #292648",
  // Amber: the recordings "processing" chip.
  "foreground color: #e17100, background color: #3e3120",
  // Red again, on the cancelled-session card's own tint.
  "foreground color: #ef4444, background color: #2f2536",
];

/** Relative luminance, for deciding whether a surface is a dark one. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * `--text-muted` on a dark surface — ADR-020's fifth exemption, as a rule
 * rather than a list.
 *
 * In the dark theme `--text-muted` is `#6b7280`, and it measures about
 * 2.8–3.7:1 on every card surface in the design. ADR-020 accepted that as a
 * category ("--text-muted on dark surfaces"), but the exemption list spelled
 * out one pair per background, and each dark tint is slightly different: a
 * notification row, a recording card, a chat bubble, a cancelled-session
 * panel. The list therefore grew every time a screen was added or a seeded
 * record changed state, and a test that fails because today's demo session
 * is cancelled rather than live is a test nobody trusts.
 *
 * Matching the decision itself is both narrower in intent and harder to
 * abuse: it is one foreground colour, only against backgrounds that really
 * are dark, and every other colour — including `--text-secondary`, and
 * including `#6b7280` on a light surface — still fails.
 */
function isMutedOnDark(summary) {
  const match = summary.match(
    /foreground color: #6b7280, background color: (#[0-9a-f]{6})/
  );
  if (!match) return false;
  return luminance(match[1]) < 0.18;
}

function isKnownPaletteNode(node) {
  const summary = (node.failureSummary ?? "").toLowerCase();
  if (isMutedOnDark(summary)) return true;
  return KNOWN_PALETTE_CONTRAST.some((pair) => summary.includes(pair));
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} label  what failed, for the error message
 * @param {{ contrast?: boolean }} [options]
 *   `contrast: false` keeps every other serious and critical rule and skips
 *   colour-contrast only. Used for the light theme — see ADR-037. The light
 *   theme fails AA contrast broadly and systemically, because text sits on
 *   pale tints of the brand colours, and on those surfaces even
 *   `--text-secondary` falls below 4.5:1. Fixing it means changing the
 *   retained palette, which the product owner has now declined for the third
 *   time (ADR-020, ADR-029, ADR-037). The alternative — listing all 47
 *   failing pairs as exemptions — would be a gate that passes by naming
 *   everything that fails it, so the scope is narrowed openly here instead
 *   of being hidden in a list. The census is in `docs/PROGRESS.md`.
 */
export async function expectNoSeriousAxeViolations(page, label, options = {}) {
  const { contrast = true } = options;

  // The dashboards fade in with motion/react, and several of them fetch once
  // per child or per course after mount. Scanning before all of that has
  // settled samples half-faded colours and skeleton placeholders, and invents
  // contrast failures that are not there once the page is at rest.
  //
  // Killing CSS animation is not enough on its own: motion/react animates an
  // inline opacity, with a per-card delay, and a card re-enters when its own
  // fetch resolves. So wait for the loading placeholders to go first, then
  // freeze what is left.
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll(".skeleton-shimmer")].every(
          (node) => node.offsetParent === null
        ),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {
      // A screen with no placeholders at all never had any to wait for.
    });

  await page
    .addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }`,
    })
    .catch(() => {});

  // Long enough for the staggered entry animations to have finished: the
  // longest is a 0.35s fade on the fifth card, delayed 0.1s each.
  await page.waitForTimeout(1500);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .filter((violation) => contrast || violation.id !== "color-contrast")
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
