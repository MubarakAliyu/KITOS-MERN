import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, openSidebar, collectErrors } from "./helpers.js";

/**
 * Batch 1 smoke tests (AC1.1, AC1.5, AC1.7).
 *
 * Each role signs in against the real API and lands on its dashboard with no
 * console errors, and the brand additions are present in both themes.
 *
 * Accessibility moved to `a11y.spec.js` in Batch 3, where it covers every
 * role's main screens in both themes rather than the dashboards alone.
 */

test.describe("sign-in", () => {
  for (const role of Object.keys(ACCOUNTS)) {
    test(`${role} signs in and reaches their dashboard with no console errors`, async ({
      page,
    }) => {
      const errors = collectErrors(page);

      const account = await signIn(page, role);

      await expect(page).toHaveURL(new RegExp(`${account.home}(/|$)`));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      // Let the dashboard's requests settle before judging the console.
      await page.waitForLoadState("networkidle");
      expect(errors(), `console errors for ${role}`).toEqual([]);
    });
  }

  test("a wrong password is refused and stays on the sign-in page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email or admission number/i).fill("admin@kidsintech.school");
    await page.getByLabel(/^password$/i).fill("definitely-wrong");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("brand", () => {
  test("the KIT logo replaces the bolt icon on the sign-in page", async ({ page }) => {
    await page.goto("/login");

    const logo = page.getByAltText("Kids In Tech").first();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", /kit-(logo|mark)/);
  });

  test("the KIT logo is in the sidebar once signed in", async ({ page }) => {
    await signIn(page, "admin");

    const sidebar = await openSidebar(page);
    await expect(sidebar.getByAltText("Kids In Tech").first()).toBeVisible();
  });

  test("Powered by StarNova Labs is on the sign-in page and links out", async ({ page }) => {
    await page.goto("/login");

    const link = page.getByRole("link", { name: /powered by starnova labs/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://www.starnovalabs.com");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("Powered by StarNova Labs is at the bottom of the sidebar", async ({ page }) => {
    await signIn(page, "parent");

    const sidebar = await openSidebar(page);
    const link = sidebar
      .getByRole("link", { name: /powered by starnova labs/i })
      .first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://www.starnovalabs.com");
  });

  test("the StarNova wordmark swaps ink between light and dark themes", async ({ page }) => {
    await signIn(page, "admin");

    const sidebar = await openSidebar(page);
    const link = sidebar
      .getByRole("link", { name: /powered by starnova labs/i })
      .first();
    await expect(link).toBeVisible();

    const visibleMark = async () =>
      link.locator("img:visible").first().getAttribute("src");

    // Force each theme directly: the toggle's position varies by viewport.
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    });
    await expect.poll(visibleMark).toContain("starnova-logo-dark");

    await page.evaluate(() => {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    });
    await expect.poll(visibleMark).toContain("starnova-logo-light");
  });

  test("the favicon is served from the KIT mark", async ({ page, request }) => {
    await page.goto("/login");

    const icon = await request.get("/icon.png");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image");
  });
});

test.describe("every sidebar screen renders", () => {
  /**
   * AC1.1, still worth keeping now that the endpoints behind these screens
   * exist. It was written to prove an empty state did not crash; it now
   * proves a populated one does not either, which is the harder case — these
   * screens render tables, charts and transcripts from real seeded data.
   *
   * The assertion is deliberately shallow (something rendered, no error
   * screen, no console errors). `journeys.spec.js` is where behaviour is
   * checked; this is the net that catches a screen that stopped loading at
   * all.
   */
  const ROUTES = {
    student: [
      "/student/courses",
      "/student/assignments",
      "/student/sessions",
      "/student/certificates",
    ],
    parent: ["/parent/children", "/parent/payments"],
    instructor: [
      "/instructor/courses",
      "/instructor/students",
      "/instructor/sessions",
    ],
    admin: [
      "/admin/users",
      "/admin/courses",
      "/admin/analytics",
      "/admin/payments",
      "/admin/sessions",
      "/admin/settings",
    ],
  };

  for (const [role, routes] of Object.entries(ROUTES)) {
    test(`${role} can open every sidebar screen without an error`, async ({ page }) => {
      const errors = collectErrors(page);
      await signIn(page, role);

      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        // Something rendered, and it is not Next.js's error screen.
        await expect(page.locator("body")).toBeVisible();
        await expect(
          page.getByText(/application error|unhandled runtime error/i)
        ).toHaveCount(0);
      }

      expect(errors(), `console errors while walking ${role} screens`).toEqual([]);
    });
  }
});
