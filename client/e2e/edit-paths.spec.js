import { test, expect } from "@playwright/test";
import { signIn, collectErrors, ACCOUNTS } from "./helpers.js";
import { api, apiLogin } from "./api.js";

/**
 * The edit paths, driven through the UI at both viewports.
 *
 * `workflows.spec.js` covers the create forms, which is where the last round
 * of production failures was. This covers the other verb, which is where the
 * next round was: saving a lesson answered 400 for `is_published` — a switch
 * the editor sends on every save, so *every* save failed — and modules had no
 * update endpoint at all, so the editor's delete button and reorder arrows
 * changed React state and nothing else. Both looked like they worked until
 * the page was reloaded.
 *
 * Playwright runs every spec under both projects (`desktop` at 1280×900 and
 * `pixel-7`), so each of these is two tests. That is deliberate: the lesson
 * editor's writing area was being crushed to about 50px on a phone by the
 * flex column it sits in, and a desktop-only run would never have shown it.
 *
 * Everything inside a modal is scoped to the dialog. Page-wide `getByLabel`
 * is a substring match, and an unscoped one will happily find the row behind
 * the overlay.
 */

const stamp = () => Date.now().toString().slice(-6);

const dialog = (page) => page.getByRole("dialog");

/**
 * Opens the course editor for a course this spec created, so renaming and
 * deleting inside it cannot disturb the seeded fixtures the other specs read.
 */
async function createCourseAndOpenEditor(page, title) {
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Add Course" }).click();

  const modal = dialog(page);
  await modal.getByLabel("Title", { exact: true }).fill(title);
  await modal.getByLabel("Description").fill("Created by the edit-path spec.");
  await modal.getByLabel("Programme Track").selectOption({ index: 1 });
  await modal.getByLabel("Instructor").selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Create Course" }).click();
  await expect(modal).toBeHidden({ timeout: 15000 });

  const card = page.locator("article", { hasText: title }).first();
  await card.getByRole("link", { name: "Manage Content" }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: "Modules" })).toBeVisible({
    timeout: 20000,
  });
}

/** Adds a module to the open course editor and returns its title. */
async function addModule(page, title) {
  await page.getByRole("button", { name: "Add Module" }).click();
  const modal = dialog(page);
  await modal.getByLabel("Module Title").fill(title);
  await modal.getByRole("button", { name: "Create Module" }).click();
  await expect(modal).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(title, { exact: false })).toBeVisible();
  return title;
}

/**
 * Opens a module row. Its lessons, and the Add Lesson button, are inside the
 * collapsed panel — there is nothing to click until the row is expanded.
 */
async function expandModule(page, index = 0) {
  await page.getByRole("button", { name: "Toggle module" }).nth(index).click();
  await expect(
    page.getByRole("button", { name: "Add Lesson" }).first()
  ).toBeVisible({ timeout: 15000 });
}

test.describe("the course editor's edit paths", () => {
  test("renames a module, and the rename survives a reload", async ({ page }) => {
    test.setTimeout(180000);
    const errors = collectErrors(page);
    const id = stamp();
    const courseTitle = `E2E Edit Course ${id}`;

    await signIn(page, "admin");
    await createCourseAndOpenEditor(page, courseTitle);
    await addModule(page, `Module ${id}`);

    await page.getByTitle("Edit module").first().click();
    const modal = dialog(page);
    await modal.getByLabel("Module Title").fill(`Module ${id} renamed`);
    await modal
      .getByLabel("Description")
      .fill("What this module covers, in a sentence.");
    await modal.getByRole("button", { name: "Save Module" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await expect(page.getByText(`Module ${id} renamed`)).toBeVisible();

    /**
     * The reload is the point. Module delete and reorder used to change the
     * page's own state and never reach the API, so both looked right until
     * something re-read the server — which, for the people using this, meant
     * the next morning.
     */
    await page.reload();
    await expect(page.getByText(`Module ${id} renamed`)).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText("What this module covers, in a sentence.")
    ).toBeVisible();

    expect(errors()).toEqual([]);
  });

  test("reorders modules, and the order survives a reload", async ({ page }) => {
    test.setTimeout(180000);
    const id = stamp();

    await signIn(page, "admin");
    await createCourseAndOpenEditor(page, `E2E Order Course ${id}`);
    await addModule(page, `First ${id}`);
    await addModule(page, `Second ${id}`);

    const rows = page.locator("li", { hasText: `${id}` });
    await expect(page.getByText(`1. First ${id}`)).toBeVisible();

    // Move the second one up.
    await page.getByTitle("Move up").nth(1).click();
    await expect(page.getByText(`1. Second ${id}`)).toBeVisible({
      timeout: 15000,
    });

    await page.reload();
    await expect(page.getByText(`1. Second ${id}`)).toBeVisible({
      timeout: 20000,
    });
    await expect(rows.first()).toContainText(`Second ${id}`);
  });

  test("deletes a module, and it stays deleted", async ({ page }) => {
    test.setTimeout(180000);
    const id = stamp();

    await signIn(page, "admin");
    await createCourseAndOpenEditor(page, `E2E Delete Course ${id}`);
    await addModule(page, `Doomed ${id}`);

    await page.getByTitle("Delete module").first().click();
    const modal = dialog(page);
    // The checkbox, not a browser confirm: this delete takes the module's
    // lessons, quizzes, assignments and the students' submissions with it.
    await modal.getByRole("checkbox").check();
    await modal.getByRole("button", { name: "Delete Module" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await expect(page.getByText(`Doomed ${id}`)).toBeHidden();
    await page.reload();
    await expect(page.getByRole("main").getByRole("heading", { name: "Modules" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(`Doomed ${id}`)).toHaveCount(0);
  });

  /**
   * The failure the user reported: "Couldn't save lesson", from a 400 naming
   * the request body. Adding a video, changing the content type and toggling
   * Published were each enough to trigger it — because the switch is in every
   * payload, so in practice nothing could be saved at all.
   */
  test("saves a lesson with a video, a content type and the Published switch", async ({
    page,
  }) => {
    test.setTimeout(200000);
    const errors = collectErrors(page);
    const id = stamp();

    await signIn(page, "admin");
    await createCourseAndOpenEditor(page, `E2E Lesson Course ${id}`);
    await addModule(page, `Lessons ${id}`);
    await expandModule(page);

    await page.getByRole("button", { name: "Add Lesson" }).first().click();
    let modal = dialog(page);
    await modal.getByLabel("Title", { exact: true }).fill(`Lesson ${id}`);
    await modal.getByLabel("Content Type").selectOption("video");
    await modal
      .getByLabel("YouTube URL")
      .fill("https://www.youtube.com/watch?v=aBcDeF12345");
    await modal.getByRole("button", { name: "Add Lesson" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await page.getByTitle("Edit lesson").first().click();
    modal = dialog(page);

    // The writing area has to be usable, not merely present. On a phone it
    // was being compressed to about one line by the scrolling flex column
    // around it, and clipped there by `overflow-hidden`.
    const writingArea = modal.locator("[contenteditable]");
    await expect(writingArea).toBeVisible();
    const box = await writingArea.boundingBox();
    expect(box.height).toBeGreaterThan(150);

    await writingArea.click();
    await page.keyboard.type("Edited by the edit-path spec.");

    await modal.getByLabel("YouTube Video URL").fill(
      "https://www.youtube.com/watch?v=zYxWvU98765"
    );
    await modal.getByRole("button", { name: "TEXT" }).click();
    // Published → Draft. This is the field the 400 was about.
    await modal.getByRole("switch").click();
    await modal.getByRole("button", { name: "Save", exact: true }).click();

    await expect(modal).toBeHidden({ timeout: 20000 });
    await expect(page.getByText("Lesson saved").first()).toBeVisible({
      timeout: 10000,
    });

    await page.reload();
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Modules" })
    ).toBeVisible({ timeout: 20000 });

    /**
     * No console assertion here, deliberately. The video ids above are made
     * up, so YouTube's thumbnail endpoint answers 404 for them and the page
     * logs it — a fact about the test's fixture, not about the page.
     */
  });

  /**
   * One renderer for lesson content, everywhere it is shown.
   *
   * This is the production complaint, and it needs Markdown *stored*, which
   * is how it got there: the seeded courses and anything an instructor
   * pasted from notes are Markdown, while the rich editor writes HTML. The
   * body is therefore arranged over the API — a lesson editor cannot produce
   * Markdown, because typing into a `contentEditable` produces HTML.
   *
   * The children saw "# Introduction" and "**Stage:**" on the lesson page
   * while the instructor's preview of the same lesson showed headings and
   * bold, because the student page printed the body as plain text and the
   * editor injected it as HTML. Both ends are checked here.
   */
  test("renders stored Markdown as formatting, not as its own source", async ({
    page,
  }) => {
    test.setTimeout(200000);
    const id = stamp();

    const adminToken = await apiLogin(
      ACCOUNTS.admin.identifier,
      ACCOUNTS.admin.password
    );
    const courses = await api(adminToken, "GET", "/admin/courses");
    const course = courses.courses[0];
    const editor = await api(
      adminToken,
      "GET",
      `/admin/courses/${course.id}/editor`
    );
    const moduleId = editor.modules[0].id;

    const lesson = await api(adminToken, "POST", "/lessons", {
      module_id: moduleId,
      title: `Markdown ${id}`,
      content_type: "text",
      body_content: [
        "# Introduction",
        "",
        "Welcome to the **Scratch** course.",
        "",
        "- Sprites are the characters",
        "- Blocks snap together",
      ].join("\n"),
    });

    await signIn(page, "admin");
    await page.goto(`/admin/courses/${course.id}/editor`);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Modules" })
    ).toBeVisible({ timeout: 20000 });
    await expandModule(page);

    // The lesson row, not the module row that contains it — an unscoped
    // `li` filter matches both, and the module row holds three of these
    // buttons.
    const row = page
      .getByTestId("lesson-row")
      .filter({ hasText: `Markdown ${id}` })
      .first();
    await row.getByTitle("Preview as student").click();

    const modal = dialog(page);
    // Real elements, not the characters that ask for them.
    await expect(
      modal.locator("h1", { hasText: "Introduction" }).first()
    ).toBeVisible({ timeout: 15000 });
    await expect(modal.locator("strong", { hasText: "Scratch" }).first()).toBeVisible();
    await expect(modal.locator("li").first()).toBeVisible();
    await expect(modal.getByText("# Introduction")).toHaveCount(0);

    // Clean up: the seeded course is shared with the other specs.
    await api(adminToken, "DELETE", `/lessons/${lesson.id}`);
  });
});

test.describe("programme tracks", () => {
  /**
   * Tracks were three strings hard-coded in four React forms and again in
   * the server's constants, so opening one meant a code change and a deploy.
   * This is the whole loop: add a track, see it offered by a course form,
   * rename it, and fail to delete it once something is filed under it.
   */
  test("adds a track, and the course form offers it", async ({ page }) => {
    test.setTimeout(180000);
    const errors = collectErrors(page);
    const name = `E2E Track ${stamp()}`;

    await signIn(page, "admin");
    await page.goto("/admin/tracks");
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Programme Tracks" })
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "New Track" }).click();
    let modal = dialog(page);
    await modal.getByLabel("Track Name").fill(name);
    await modal.getByLabel("Description").fill("Added by the edit-path spec.");
    await modal.getByRole("button", { name: "Add Track" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });
    // Scoped to the row: the success toast carries the name too.
    await expect(
      page.getByTestId("track-row").filter({ hasText: name })
    ).toBeVisible({ timeout: 15000 });

    // The point of making tracks data: a form offers it without a deploy.
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    modal = dialog(page);
    await expect(
      modal.getByLabel("Programme Track").getByRole("option", { name })
    ).toHaveCount(1);
    await modal.getByRole("button", { name: "Cancel" }).click();

    expect(errors()).toEqual([]);
  });

  test("renames a track and archives it", async ({ page }) => {
    test.setTimeout(180000);
    const id = stamp();
    const name = `E2E Rename ${id}`;

    await signIn(page, "admin");
    await page.goto("/admin/tracks");
    await page.getByRole("button", { name: "New Track" }).click();
    let modal = dialog(page);
    await modal.getByLabel("Track Name").fill(name);
    await modal.getByRole("button", { name: "Add Track" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await page.getByRole("button", { name: `Edit ${name}` }).click();
    modal = dialog(page);
    await modal.getByLabel("Track Name").fill(`${name} renamed`);
    await modal.getByRole("button", { name: "Save Track" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });
    await expect(
      page.getByTestId("track-row").filter({ hasText: `${name} renamed` })
    ).toBeVisible({ timeout: 15000 });

    await page
      .getByRole("button", { name: `Archive ${name} renamed` })
      .click();
    await expect(page.getByText("Archived").first()).toBeVisible({
      timeout: 15000,
    });

    // Archived means "not offered for new work", so the course form drops it.
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();
    const courseModal = dialog(page);
    await expect(
      courseModal
        .getByLabel("Programme Track")
        .getByRole("option", { name: `${name} renamed` })
    ).toHaveCount(0);
  });

  /**
   * A track a course is filed under cannot be deleted — deleting it would
   * leave that course naming a row that no longer exists. The button is
   * disabled and the API refuses it too.
   */
  test("will not delete a track that is in use", async ({ page }) => {
    test.setTimeout(120000);

    await signIn(page, "admin");
    await page.goto("/admin/tracks");
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Programme Tracks" })
    ).toBeVisible({ timeout: 20000 });

    const inUse = page
      .getByTestId("track-row")
      .filter({ hasText: "Scratch Programming" })
      .first();
    await expect(inUse).toBeVisible();
    await expect(
      inUse.getByRole("button", { name: /^Delete / })
    ).toBeDisabled();
  });
});

test.describe("the other edit modals", () => {
  test("edits a course from the course list", async ({ page }) => {
    test.setTimeout(180000);
    const errors = collectErrors(page);
    const id = stamp();
    const title = `E2E Course Edit ${id}`;

    await signIn(page, "admin");
    await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Add Course" }).click();

    let modal = dialog(page);
    await modal.getByLabel("Title", { exact: true }).fill(title);
    await modal.getByLabel("Description").fill(`Before the edit ${id}.`);
    await modal.getByLabel("Programme Track").selectOption({ index: 1 });
    await modal.getByLabel("Instructor").selectOption({ index: 1 });
    await modal.getByRole("button", { name: "Create Course" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    const card = page.locator("article", { hasText: title }).first();
    await card.getByRole("button", { name: "Edit" }).click();

    modal = dialog(page);
    await modal.getByLabel("Description").fill(`After the edit ${id}.`);
    await modal.getByRole("button", { name: "Save Changes" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await page.reload();
    /**
     * Stamped, because both viewport projects run against the same database.
     * An unstamped description matched the course the desktop run had just
     * created as well as this one, and the strict locator refused to choose.
     */
    await expect(page.getByText(`After the edit ${id}.`)).toBeVisible({
      timeout: 20000,
    });
    expect(errors()).toEqual([]);
  });

  test("edits a user from the user list", async ({ page }) => {
    test.setTimeout(180000);
    const errors = collectErrors(page);
    const id = stamp();
    const name = `E2E Staff ${id}`;

    await signIn(page, "admin");
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Add User" }).click();

    let modal = dialog(page);
    await modal.getByLabel("Full Name").fill(name);
    await modal.getByLabel("Role").selectOption("instructor");
    await modal.getByLabel("Email", { exact: true }).fill(`e2e.staff.${id}@example.com`);
    await modal.getByRole("button", { name: "Create User" }).click();

    // The one-time password dialog, which closes only on "Done".
    await page.getByRole("button", { name: "Done" }).click();

    const row = page.locator("tr", { hasText: name }).first();
    await row.getByTitle("Edit user").click();

    modal = dialog(page);
    await modal.getByLabel("Full Name").fill(`${name} renamed`);
    await modal.getByRole("button", { name: "Save Changes" }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    await page.reload();
    await expect(page.getByText(`${name} renamed`)).toBeVisible({
      timeout: 20000,
    });
    expect(errors()).toEqual([]);
  });
});
