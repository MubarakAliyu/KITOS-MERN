import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  signIn,
  openSidebar,
  collectErrors,
  expectNoSeriousAxeViolations,
} from "./helpers.js";

/**
 * Batch 1 smoke tests (AC1.1, AC1.5, AC1.7).
 *
 * Each role signs in against the real API and lands on its dashboard with no
 * console errors; the brand additions are present in both themes; and axe
 * finds nothing serious or critical on the sign-in page or any dashboard home.
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

test.describe("accessibility", () => {
  test("the sign-in page has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expectNoSeriousAxeViolations(page, "/login");
  });

  for (const role of Object.keys(ACCOUNTS)) {
    test(`the ${role} dashboard has no serious or critical axe violations`, async ({
      page,
    }) => {
      await signIn(page, role);
      await page.waitForLoadState("networkidle");

      await expectNoSeriousAxeViolations(page, `${role} dashboard`);
    });
  }
});

test.describe("screens awaiting later batches", () => {
  /**
   * AC1.1: screens whose endpoints arrive in Batch 2 or 3 must show their
   * empty state rather than crashing.
   */
  const ROUTES = {
    student: ["/student/courses", "/student/assignments", "/student/certificates"],
    parent: ["/parent/children", "/parent/payments"],
    instructor: ["/instructor/courses", "/instructor/students"],
    admin: ["/admin/users", "/admin/courses", "/admin/analytics", "/admin/payments"],
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
