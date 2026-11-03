import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, switchTo, collectErrors } from "./helpers.js";
import {
  api,
  apiLogin,
  cancelSession,
  createDraftCourse,
  deleteCourse,
  enrol,
  instructorUserId,
  localDateTimeFields,
  publishCourse,
  studentRecordId,
} from "./api.js";

/**
 * Batch 2 Part G: the two journeys the batch exists to make work.
 *
 * Both run against the real API on the seeded database, and both build the
 * data they need relative to the moment they run. Nothing here depends on the
 * seed's own timing: the seeded live class only stays live for an hour, so a
 * suite that leaned on it would pass in the morning and fail by lunch, which
 * is worse than no test at all.
 *
 * Each journey tidies up after itself so repeated runs do not pile up courses
 * and classes that later assertions would have to step around.
 */

/**
 * Waits for a class to start.
 *
 * The status is computed from the clock, not stored, so there is nothing to
 * poke — the only honest way to see a class go live is to wait for its start
 * time to arrive.
 */
async function waitForLive(token, sessionId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = await api(token, "GET", `/sessions/${sessionId}`);
    if (session.status === "live") return session;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Session ${sessionId} never went live within ${timeoutMs}ms`);
}

/** Distinguishes this run's data, and the two viewport projects from each other. */
function stamp(project) {
  return `${project}-${Date.now().toString(36)}`;
}

test.describe("the learning journey", () => {
  let adminToken;
  let courseId;

  test.afterEach(async () => {
    if (adminToken && courseId) await deleteCourse(adminToken, courseId);
    courseId = null;
  });

  test("an instructor's new content reaches the child, the parent, and a certificate that verifies", async ({
    page,
  }, testInfo) => {
    // Six sign-ins, three authoring forms and a quiz sat end to end: well
    // past the default per-test budget, and none of it is waiting on a poll.
    test.setTimeout(300_000);

    const errors = collectErrors(page);
    const run = stamp(testInfo.project.name);
    const courseTitle = `Journey Course ${run}`;
    const moduleTitle = `Journey Module ${run}`;
    const lessonTitle = `Journey Lesson ${run}`;
    const quizTitle = `Journey Quiz ${run}`;

    // ── Arrange: an empty course, assigned to the instructor ────────────────
    adminToken = await apiLogin(ACCOUNTS.admin.identifier, ACCOUNTS.admin.password);
    const instructorToken = await apiLogin(
      ACCOUNTS.instructor.identifier,
      ACCOUNTS.instructor.password
    );

    const instructorId = await instructorUserId(adminToken, ACCOUNTS.instructor.identifier);
    const studentId = await studentRecordId(instructorToken, ACCOUNTS.student.identifier);

    const course = await createDraftCourse(adminToken, {
      title: courseTitle,
      instructorId,
    });
    courseId = course.id;

    // ── The instructor writes a module, a lesson and a quiz ─────────────────
    await signIn(page, "instructor");
    await page.goto("/instructor/courses");

    const card = page.locator("article").filter({ hasText: courseTitle });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Add Module" }).click();
    const moduleDialog = page.getByRole("dialog", { name: /add module/i });
    await moduleDialog.locator("#mod-title").fill(moduleTitle);
    await moduleDialog.getByRole("button", { name: /create module/i }).click();
    await expect(moduleDialog).toBeHidden();

    // The course section loads its modules once on mount, so a new one
    // appears after a reload — the screen says as much when it saves.
    await page.reload();
    const reloadedCard = page.locator("article").filter({ hasText: courseTitle });
    const moduleRow = reloadedCard.locator("li").filter({ hasText: moduleTitle }).first();
    await expect(moduleRow).toBeVisible();

    // Expanding the row reveals its lessons, quiz and assignment.
    await moduleRow.getByText(moduleTitle).click();

    await moduleRow.getByRole("button", { name: "Add Lesson" }).click();
    const lessonDialog = page.getByRole("dialog", { name: /add lesson/i });
    await lessonDialog.locator("#ls-title").fill(lessonTitle);
    await lessonDialog.locator("#ls-type").selectOption("text");
    await lessonDialog
      .locator("#ls-body")
      .fill("A sprite is a character you can move around the stage.");
    await lessonDialog.getByRole("button", { name: /^add lesson$/i }).click();
    await expect(lessonDialog).toBeHidden();

    await moduleRow.getByRole("button", { name: "Add Quiz" }).click();
    const quizDialog = page.getByRole("dialog", { name: /add quiz/i });
    await quizDialog.locator("#qz-title").fill(quizTitle);
    await quizDialog.getByPlaceholder("Question text").fill("What moves around the stage?");
    await quizDialog.getByPlaceholder("Option A").fill("A sprite");
    await quizDialog.getByPlaceholder("Option B").fill("The mouse");
    await quizDialog.getByPlaceholder("Option C").fill("The keyboard");
    await quizDialog.getByPlaceholder("Option D").fill("Nothing");
    await quizDialog.locator("select").selectOption("A");
    await quizDialog.getByRole("button", { name: /create quiz/i }).click();
    await expect(quizDialog).toBeHidden();

    // It really is on the course, not just on the screen.
    const modules = await api(instructorToken, "GET", `/courses/${courseId}/modules`);
    const written = modules.find((m) => m.title === moduleTitle);
    expect(written, "the module the instructor created").toBeTruthy();
    expect(written.lessons_count).toBe(1);
    expect(written.quiz_id).toBeTruthy();

    // ── The administrator publishes it and enrols the child ─────────────────
    await publishCourse(adminToken, courseId);
    await enrol(adminToken, { studentId, courseId });

    // ── The child does the work ─────────────────────────────────────────────
    await switchTo(page, "student");
    await page.goto("/student/courses");
    const studentCard = page.locator("article").filter({ hasText: courseTitle });
    await expect(studentCard).toBeVisible();
    await studentCard.getByRole("link", { name: /^(start|continue)$/i }).click();
    await page.waitForURL(/\/student\/courses\/[a-f0-9]+/);

    await page.getByText(moduleTitle).first().click();
    await page.getByRole("link", { name: lessonTitle }).click();
    await page.waitForURL(/\/student\/lessons\/[a-f0-9]+/);

    await page.getByRole("button", { name: /mark complete/i }).click();
    await expect(page.getByRole("button", { name: /^completed$/i })).toBeVisible();

    // Back to the course for the quiz.
    await page.goBack();
    await page.getByText(moduleTitle).first().click();
    await page.getByRole("button", { name: /take quiz/i }).click();

    await page.getByText("What moves around the stage?").waitFor();
    await page.getByText("A sprite", { exact: true }).click();
    await page.getByRole("button", { name: /submit quiz/i }).click();

    await expect(page.getByText(/1 \/ 1 correct/i)).toBeVisible();

    // One lesson and one quiz, both done: the course is finished, so the
    // certificate must exist. Finishing on the quiz is exactly the case that
    // used to lose it.
    const certificates = await api(
      await apiLogin(ACCOUNTS.student.identifier, ACCOUNTS.student.password),
      "GET",
      "/certificates"
    );
    const earned = certificates.find((c) => c.course_title === courseTitle);
    expect(earned, "a certificate for the course just finished").toBeTruthy();
    expect(earned.verification_code).toMatch(/^[A-Z0-9]{10}$/);

    await page.goto("/student/certificates");
    await expect(page.getByText(courseTitle)).toBeVisible();

    // ── The parent sees it ──────────────────────────────────────────────────
    await switchTo(page, "parent");
    await page.goto("/parent/children");
    await expect(page.getByText(courseTitle).first()).toBeVisible();

    // ── Anyone handed the certificate can check it ──────────────────────────
    await page.context().clearCookies();
    await page.goto(`/verify/${earned.verification_code}`);

    await expect(page.getByText(/this certificate is genuine/i)).toBeVisible();
    await expect(page.getByText(courseTitle)).toBeVisible();
    // Initials only: a public page must not name a child (FR11).
    await expect(page.getByText("Liam Hassan")).toHaveCount(0);

    expect(errors(), "console errors across the journey").toEqual([]);
  });

  test("a made-up verification code is refused", async ({ page }) => {
    await page.goto("/verify/ZZZZZZZZZZ");
    await expect(page.getByText(/no certificate matches that code/i)).toBeVisible();
  });
});

test.describe("the hybrid session journey", () => {
  let instructorToken;
  let sessionId;

  test.afterEach(async () => {
    if (instructorToken && sessionId) await cancelSession(instructorToken, sessionId);
    sessionId = null;
  });

  test("a class scheduled now reaches the child, takes a register both ways, and leaves a recording", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);

    const errors = collectErrors(page);
    const run = stamp(testInfo.project.name);
    const sessionTitle = `Journey Class ${run}`;

    instructorToken = await apiLogin(
      ACCOUNTS.instructor.identifier,
      ACCOUNTS.instructor.password
    );

    // ── The instructor schedules a class, two minutes out ───────────────────
    // The form only accepts a future time, which is right: an instructor
    // schedules classes, they do not backdate them. So the journey books one
    // shortly ahead, checks the child can see it coming, and then waits for
    // it to go live — which also exercises the scheduled → live transition
    // that nothing else covers.
    const startsAt = new Date(Date.now() + 2 * 60 * 1000);
    const { date, time } = localDateTimeFields(startsAt);

    await signIn(page, "instructor");
    await page.goto("/instructor/sessions");

    await page.getByRole("button", { name: /create session/i }).first().click();
    const form = page.getByRole("dialog", { name: /create session/i });

    // Scratch Programming: the seeded child is already enrolled on it, so the
    // class has a register to take.
    await form.locator("#s-course").selectOption({ label: "Scratch Programming" });
    await form.locator("#s-title").fill(sessionTitle);
    await form.locator("#s-date").fill(date);
    await form.locator("#s-time").fill(time);
    await form.locator("#s-duration").selectOption("60");
    await form.locator("#s-join").fill("https://meet.google.com/journey-test");
    await form.getByRole("button", { name: /create|save/i }).click();
    await expect(form).toBeHidden();

    const mine = await api(instructorToken, "GET", "/instructors/me/sessions");
    const scheduled = mine.find((s) => s.title === sessionTitle);
    expect(scheduled, "the class the instructor scheduled").toBeTruthy();
    sessionId = scheduled.id;
    expect(scheduled.status).toBe("scheduled");

    // ── The child sees it coming ────────────────────────────────────────────
    // The screen opens on Live, which is right for a child arriving at class
    // time; a class that has not started yet is under Upcoming.
    await switchTo(page, "student");
    await page.goto("/student/sessions");
    await page.getByRole("button", { name: /upcoming/i }).click();
    await expect(page.getByText(sessionTitle).first()).toBeVisible();

    // ── And then it starts ──────────────────────────────────────────────────
    await waitForLive(instructorToken, sessionId);

    await page.goto("/student");
    await expect(page.getByText(/live session/i).first()).toBeVisible();
    await expect(page.getByText(sessionTitle).first()).toBeVisible();

    // ── The register, by QR ─────────────────────────────────────────────────
    // The camera cannot be driven here: there is no device, and a scan needs
    // BarcodeDetector, which headless Chromium does not ship. The manual code
    // field is the same path a child on an unsupported browser takes, and it
    // posts the same token, so it exercises the real check-in.
    const qr = await api(instructorToken, "POST", `/sessions/${sessionId}/qr-token`);
    expect(qr.token).toBeTruthy();

    await page.getByRole("button", { name: /scan to check in/i }).click();
    const checkIn = page.getByRole("dialog", { name: /check in to this class/i });
    await checkIn.locator("#checkin-code").fill(qr.token);
    await checkIn.getByRole("button", { name: /^check in$/i }).click();
    await expect(page.getByText(/you're checked in/i).first()).toBeVisible();

    const afterScan = await api(instructorToken, "GET", `/sessions/${sessionId}/roster`);
    const child = afterScan.students.find(
      (s) => s.admission_no === ACCOUNTS.student.identifier
    );
    expect(child.status).toBe("present");
    expect(child.method).toBe("qr");

    // ── The register, by hand ───────────────────────────────────────────────
    await switchTo(page, "instructor");
    await page.goto(`/instructor/sessions/${sessionId}`);

    await page.getByRole("button", { name: /mark all present/i }).click();
    await page.getByRole("button", { name: /save attendance/i }).click();
    await expect(page.getByText(/attendance saved/i).first()).toBeVisible();

    const afterRoster = await api(instructorToken, "GET", `/sessions/${sessionId}/roster`);
    expect(afterRoster.students.length).toBeGreaterThan(0);
    for (const student of afterRoster.students) {
      expect(student.status, `${student.name} on the register`).toBe("present");
    }

    // ── A recording, which the child can then watch ─────────────────────────
    // A recording belongs to a class that is over, and the screen only offers
    // the action once the class has ended. Rather than hold the suite open for
    // the rest of the hour, the instructor's own API moves the class into the
    // past; everything after this is the real UI again.
    await api(instructorToken, "PUT", `/sessions/${sessionId}`, {
      scheduled_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    });

    await page.goto("/instructor/sessions");
    // The tab carries a count beside its label, so match the label only.
    await page.getByRole("button", { name: /^completed\s*\d*$/i }).click();
    const row = page.locator("article").filter({ hasText: sessionTitle }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /add recording/i }).click();

    const recordingDialog = page.getByRole("dialog", { name: /add session recording/i });
    await recordingDialog
      .locator("#rec-url")
      .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await recordingDialog.getByRole("button", { name: /save recording/i }).click();
    await expect(recordingDialog).toBeHidden();

    // Recordings are listed from /recordings; the per-session route is write-only.
    const recordings = await api(instructorToken, "GET", "/recordings");
    expect(recordings.filter((r) => r.session_id === sessionId)).toHaveLength(1);

    await switchTo(page, "student");
    await page.goto("/student/recordings");
    await expect(page.getByText(sessionTitle).first()).toBeVisible();

    expect(errors(), "console errors across the journey").toEqual([]);
  });
});
