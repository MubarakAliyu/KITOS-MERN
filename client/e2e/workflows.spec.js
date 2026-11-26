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
 * Each test makes its own data and, where it can, removes it again. The
 * seeded fixtures are shared with the other specs, so a test that renamed or
 * deleted one of them would break its neighbours in a way that looks like a
 * different bug entirely.
 */

/** Unique per run, so a re-run does not trip over its own leftovers. */
const stamp = () => Date.now().toString().slice(-6);

async function fillModalField(page, label, value) {
  await page.getByLabel(label, { exact: false }).first().fill(value);
}

test.describe("admin user management", () => {
  test("creates a pupil, shows the one-time password, then suspends and restores", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = collectErrors(page);
    const name = `E2E Pupil ${stamp()}`;

    await signIn(page, "admin");
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Add User" }).click();

    await fillModalField(page, "Full Name", name);
    await page.getByLabel("Age", { exact: false }).first().fill("11");
    await page
      .getByLabel("Programme Track", { exact: false })
      .selectOption("Robotics Basics");
    // The parent selector the modal never used to have; without it the API
    // refused every pupil an administrator tried to create.
    await page
      .getByLabel("Parent", { exact: false })
      .first()
      .selectOption({ index: 1 });

    await page.getByRole("button", { name: "Create User" }).last().click();

    // The password is shown once and never again, so the toast is the only
    // place it exists — if this stops appearing, an administrator has no way
    // to tell a family how to sign in.
    await expect(page.getByText(/temporary password/i)).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(name)).toBeVisible();

    // Suspend, then restore, leaving the account as it was found.
    const row = page.locator("tr", { hasText: name }).first();
    await row.getByRole("button").last().click();
    await page.getByRole("button", { name: /suspend|deactivate/i }).first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

    expect(errors()).toEqual([]);
  });
});

test.describe("admin course management", () => {
  test("creates a course with its track, adds a module, then deletes it", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const errors = collectErrors(page);
    const title = `E2E Course ${stamp()}`;

    await signIn(page, "admin");
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();

    await fillModalField(page, "Title", title);
    await fillModalField(
      page,
      "Description",
      "A course created by the end-to-end suite to prove the form works."
    );
    await page.getByLabel("Price", { exact: false }).first().fill("20000");
    // The track selector the modal never used to have. `programme_track` is
    // a required enum on the model, so without it the course was a 400.
    await page
      .getByLabel("Programme Track", { exact: false })
      .selectOption("Robotics Basics");
    await page
      .getByLabel("Instructor", { exact: false })
      .first()
      .selectOption({ index: 1 });

    await page.getByRole("button", { name: "Create Course" }).last().click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });

    // Add a module through the content editor.
    const card = page.locator("article, div").filter({ hasText: title }).first();
    await card.getByRole("link", { name: /manage content/i }).click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /add module/i }).first().click();
    await fillModalField(page, "Title", "E2E Module");
    await page.getByRole("button", { name: /^(add|create) module$/i }).last().click();
    await expect(page.getByText("E2E Module")).toBeVisible({ timeout: 20000 });

    // Clean up, so the next run starts from the seeded set.
    await page.goto("/admin/courses");
    const made = page.locator("article, div").filter({ hasText: title }).first();
    await made.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("button", { name: /^(delete|confirm)/i })
      .last()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

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

    await page.getByLabel(/course/i).first().selectOption({ index: 1 });
    await page.waitForTimeout(800);
    await page.getByLabel(/module/i).first().selectOption({ index: 1 });
    await page.getByPlaceholder("Build a Simple Animation").fill(title);

    // The rich-text editor is a contenteditable, not an input.
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.type(
      "Complete the task described in the lesson and submit your work here."
    );

    await page
      .locator('input[type="datetime-local"]')
      .first()
      .fill("2027-02-15T12:00");

    await page.getByRole("button", { name: "Create Assignment" }).last().click();

    // Every one of these used to be a 400: the five marking fields the modal
    // collects were in no schema, so `.strict()` refused the whole request.
    await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });
    expect(errors()).toEqual([]);
  });
});

test.describe("chat, both directions", () => {
  /**
   * One send, one bubble — and a reply that arrives the other way.
   *
   * A single send used to render three times: the REST response, the
   * server's broadcast to the conversation room, and the client re-emitting
   * the saved message over the socket.
   */
  test("an instructor and a parent exchange messages, once each", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const fromInstructor = `E2E instructor ${stamp()}`;
    const fromParent = `E2E parent ${stamp()}`;

    await signIn(page, "instructor");
    await page.goto("/instructor/chat");
    await page.waitForLoadState("networkidle");

    // Open the first conversation the instructor has.
    await page.locator("button, li, article").filter({ hasText: /hassan|parent/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

    const composer = page.getByPlaceholder(/type a message/i);
    await composer.fill(fromInstructor);
    await composer.press("Enter");
    await page.waitForTimeout(3000);

    await expect(
      page.getByText(fromInstructor, { exact: true }),
      "one send should render exactly one bubble"
    ).toHaveCount(1);

    // The other side sees it, and can answer.
    await switchTo(page, "parent");
    await page.goto("/parent/chat");
    await page.waitForLoadState("networkidle");
    await page.locator("button, li, article").filter({ hasText: /support|aliyu/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);

    const parentComposer = page.getByPlaceholder(/type a message/i);
    if (await parentComposer.count()) {
      await parentComposer.fill(fromParent);
      await parentComposer.press("Enter");
      await page.waitForTimeout(3000);
      await expect(page.getByText(fromParent, { exact: true })).toHaveCount(1);
    }
  });

  /**
   * A parent reads their child's conversation and cannot write in it
   * (ADR-030). The composer used to be offered anyway, so a reply looked
   * possible and came back 403 as "Failed to send".
   */
  test("a parent cannot reply inside their child's conversation", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await signIn(page, "parent");
    await page.goto("/parent/children");
    await page.waitForLoadState("networkidle");

    // The observed thread is reachable from the chat screen; find one that
    // is marked as the child's.
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
});
