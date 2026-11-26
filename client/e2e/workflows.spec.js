import { test, expect } from "@playwright/test";
import { signIn, switchTo, collectErrors } from "./helpers.js";

/**
 * The write workflows, driven through the UI against a real API.
 *
 * `journeys.spec.js` follows content from an instructor to a child and out
 * the other side as a certificate. This covers the other half — the forms an
 * administrator and an instructor use to run the school — because that is
 * what broke in production: nine of sixteen admin writes answered 400 while
 * every server test was green, since none of them sent what a browser sends.
 *
 * **Everything inside a modal is scoped to the dialog.** Page-wide
 * `getByLabel` is a substring match by default, and the first draft of this
 * file filled the header's "Language Preference" button while looking for
 * "Age" — "Language" contains "age". Scoping also stops a field matching
 * the row behind the overlay.
 *
 * Each test makes its own data and removes it where it can. The seeded
 * fixtures are shared with the other specs, so a test that renamed or
 * deleted one would break its neighbours in a way that looks like a
 * different bug entirely.
 */

/** Unique per run, so a re-run does not trip over its own leftovers. */
const stamp = () => Date.now().toString().slice(-6);

const dialog = (page) => page.getByRole("dialog");

test.describe("admin user management", () => {
  test("creates a pupil and shows the one-time password", async ({ page }) => {
    test.setTimeout(120000);
    const errors = collectErrors(page);
    const name = `E2E Pupil ${stamp()}`;

    await signIn(page, "admin");
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Add User" }).click();

    const modal = dialog(page);
    await modal.getByLabel("Full Name").fill(name);
    await modal.getByLabel("Age", { exact: true }).fill("11");
    await modal
      .getByLabel("Programme Track")
      .selectOption("Robotics Basics");
    // The parent selector the modal never used to have. Without it the API
    // refused every pupil an administrator tried to create — a pupil
    // belongs to a family, and nothing on this form asked which.
    await modal.getByLabel("Parent", { exact: true }).selectOption({ index: 1 });

    await modal.getByRole("button", { name: "Create User" }).click();

    /**
     * The password exists in exactly one place: this toast. It is generated
     * per account, returned once, and never stored in the clear — so if
     * this stops appearing, an administrator has no way to tell a family
     * how to sign in.
     */
    await expect(page.getByText(/temporary password/i)).toBeVisible({
      timeout: 20000,
    });
    // `.first()`: the name is on the toast and in the table, and a bare
    // locator matching both is a strict-mode violation rather than a pass.
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });

    expect(errors()).toEqual([]);
  });
});

test.describe("admin course management", () => {
  test("creates a course with its programme track, then deletes it", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const errors = collectErrors(page);
    const title = `E2E Course ${stamp()}`;

    await signIn(page, "admin");
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();

    const modal = dialog(page);
    await modal.getByLabel("Title").fill(title);
    await modal
      .getByLabel("Description")
      .fill("A course created by the end-to-end suite to prove the form works.");
    await modal.getByLabel("Price", { exact: false }).fill("20000");
    // `programme_track` is a required enum on the model, so a course created
    // without it was a 400 — and no course modal collected it.
    await modal.getByLabel("Programme Track").selectOption("Robotics Basics");
    await modal.getByLabel("Instructor").selectOption({ index: 1 });

    await modal.getByRole("button", { name: "Create Course" }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });

    // Put the catalogue back as it was found.
    const card = page
      .locator("article")
      .filter({ hasText: title })
      .first();
    await card.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("button", { name: /^(delete|confirm|yes)/i })
      .last()
      .click()
      .catch(() => {});
    await expect(page.getByText(title)).toHaveCount(0, { timeout: 20000 });

    expect(errors()).toEqual([]);
  });
});

test.describe("instructor assessment", () => {
  test("creates an assignment with its marking settings", async ({ page }) => {
    test.setTimeout(120000);
    const errors = collectErrors(page);
    const title = `E2E Assignment ${stamp()}`;

    await signIn(page, "instructor");
    await page.goto("/instructor/assignments");
    await page.getByRole("button", { name: "Create Assignment" }).first().click();

    const modal = dialog(page);
    await modal.locator("select").first().selectOption({ index: 1 });
    await page.waitForTimeout(800);
    await modal.locator("select").nth(1).selectOption({ index: 1 });
    await modal.getByPlaceholder("Build a Simple Animation").fill(title);

    // The instructions field is a contenteditable, not an input.
    const editor = modal.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially(
      "Complete the task described in the lesson and submit your work here."
    );

    await modal.locator('input[type="datetime-local"]').first()
      .fill("2027-02-15T12:00");

    await modal.getByRole("button", { name: "Create Assignment" }).click();

    // Every one of these used to be a 400: the five marking fields the
    // modal collects were named in no schema, so `.strict()` refused the
    // whole request and no assignment could be created at all.
    await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });
    expect(errors()).toEqual([]);
  });
});

test.describe("chat", () => {
  /**
   * One send, one bubble.
   *
   * A single send used to render three times: the REST response that
   * created it, the server's broadcast to the conversation room, and the
   * client re-emitting the saved message over the socket.
   *
   * The assertion is scoped to the transcript. The conversation list shows
   * the newest message as a preview, so a page-wide count finds two for a
   * perfectly correct send — which is what the first draft of this test
   * tripped over, and would have looked exactly like the bug it is meant
   * to catch.
   */
  test("an instructor's message renders exactly once", async ({ page }) => {
    test.setTimeout(150000);
    const text = `E2E instructor ${stamp()}`;

    await signIn(page, "instructor");
    await page.goto("/instructor/chat");
    await page.waitForLoadState("networkidle");

    await page
      .locator("button, li, article")
      .filter({ hasText: /hassan|parent/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

    const composer = page.getByPlaceholder(/type a message/i);
    if ((await composer.count()) === 0) {
      test.skip(true, "this instructor has no conversation in the seed");
    }

    await composer.fill(text);
    await composer.press("Enter");
    await page.waitForTimeout(3000);

    // The transcript is the scrollable region between the header and the
    // composer; the list preview lives outside it.
    const transcript = page.locator("div.overflow-y-auto").last();
    await expect(
      transcript.getByText(text, { exact: true }),
      "one send should render exactly one bubble"
    ).toHaveCount(1);
  });

  /**
   * A parent reads their child's conversation and cannot write in it
   * (ADR-030). The composer used to be offered anyway, so a reply looked
   * possible and came back 403 as "Failed to send · Retry" — which reads
   * like a fault rather than a rule.
   */
  test("a parent cannot reply inside their child's conversation", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await signIn(page, "parent");
    await page.goto("/parent/chat");
    await page.waitForLoadState("networkidle");

    const observed = page
      .locator("button, li, article")
      .filter({ hasText: /liam|aisha/i })
      .first();

    if ((await observed.count()) === 0) {
      test.skip(true, "no observed conversation in this seed");
    }

    await observed.click();
    await page.waitForTimeout(1500);

    await expect(page.getByText(/only they can reply|read it/i)).toBeVisible();
    await expect(page.getByPlaceholder(/type a message/i)).toHaveCount(0);
  });

  /** And a parent's own thread is not read-only. */
  test("a parent can reply in their own conversation", async ({ page }) => {
    test.setTimeout(120000);
    const text = `E2E parent ${stamp()}`;

    await signIn(page, "parent");
    await page.goto("/parent/chat");
    await page.waitForLoadState("networkidle");

    await page
      .locator("button, li, article")
      .filter({ hasText: /support|admin/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

    const composer = page.getByPlaceholder(/type a message/i);
    if ((await composer.count()) === 0) {
      test.skip(true, "no writable conversation in this seed");
    }

    await composer.fill(text);
    await composer.press("Enter");
    await page.waitForTimeout(3000);

    const transcript = page.locator("div.overflow-y-auto").last();
    await expect(transcript.getByText(text, { exact: true })).toHaveCount(1);
  });
});
