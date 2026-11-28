import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import {
  app,
  makeUser,
  makeFamily,
  auth,
  resetState,
  missingId,
} from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Module } from "../src/models/Module.js";
import { Lesson } from "../src/models/Lesson.js";
import { Quiz } from "../src/models/Quiz.js";
import { Assignment } from "../src/models/Assignment.js";
import { Session } from "../src/models/Session.js";
import { Student } from "../src/models/Student.js";
import { Track } from "../src/models/Track.js";
import { Enrollment } from "../src/models/Enrollment.js";

/**
 * Every **edit** path, posted with the exact payload its form builds.
 *
 * `admin-forms.test.js` did this for the create forms after nine of sixteen
 * admin writes turned out to be failing in production. It stopped there, and
 * the edit paths went on failing: saving a lesson answered 400 "Unrecognized
 * key" for `is_published` — a switch the editor sends on every save, so every
 * save failed — and the resources rail sent `{ id, name, url }` where the API
 * stores `{ title, url }`, which failed twice over in the same request.
 *
 * Modules were worse than broken: there was no `PUT /modules/:id` at all, and
 * the editor's delete button and reorder arrows only ever changed React
 * state, so both looked like they worked until the page was reloaded.
 *
 * So: one test per update and delete, each sending what the browser sends,
 * including the keys the form carries for its own display. When a form
 * changes, change the payload here — one that has drifted from its form
 * tests nothing.
 */

let server;

beforeEach(async () => {
  await resetState();
  server = app();
});

const post = (user, path, body) =>
  request(server).post(path).set(auth(user)).send(body);
const put = (user, path, body) =>
  request(server).put(path).set(auth(user)).send(body);
const del = (user, path) => request(server).delete(path).set(auth(user));

/** Fails with the server's own message, which is the useful half. */
function expectOk(res, expected = 200) {
  if (res.status !== expected) {
    throw new Error(
      `expected ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
}

/** A course with one module and one lesson, owned by the given instructor. */
async function makeContent(instructor) {
  const course = await Course.create({
    title: "Scratch Programming",
    description: "Visual programming",
    programme_track: "scratch",
    instructor_id: instructor._id,
    status: "published",
    price_kobo: 1500000,
    payment_type: "one_time",
  });
  const module = await Module.create({
    course_id: course._id,
    title: "Getting Started",
    order_index: 1,
  });
  const lesson = await Lesson.create({
    module_id: module._id,
    course_id: course._id,
    title: "What is Scratch?",
    content_type: "video",
    body_content: "<p>Hello</p>",
    order_index: 1,
  });
  return { course, module, lesson };
}

// ── Lessons ─────────────────────────────────────────────────────────────────

describe("the Edit Lesson modal", () => {
  /**
   * The payload from `handleSave` in EditLessonModal, in full.
   *
   * Every key here was being sent while the endpoint was answering 400. The
   * two that caused it: `is_published`, which the Published/Draft switch
   * sends on every save whether or not it was touched, and a resource row in
   * the rail's own shape.
   */
  const lessonPayload = (over = {}) => ({
    title: "What is Scratch?",
    content_type: "text",
    youtube_url: "https://www.youtube.com/watch?v=aBcDeF12345",
    body_content: "<h2>Updated</h2><p>Body</p>",
    order_index: 1,
    is_published: true,
    resources: [{ id: "r-1764", name: "Slides", url: "https://x.test/a.pdf" }],
    ...over,
  });

  it("saves the whole payload the editor sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { lesson } = await makeContent(instructor);

    const res = await put(admin, `/lessons/${lesson.id}`, lessonPayload());

    expectOk(res);
    expect(res.body.is_published).toBe(true);
    // The rail's `{ id, name, url }` is stored as the API's `{ title, url }`:
    // the id is a React key, and `name` is the same field under another name.
    expect(res.body.resources).toEqual([
      { title: "Slides", url: "https://x.test/a.pdf" },
    ]);
  });

  it.each(["video", "text", "link", "file"])(
    "accepts the %s content type the picker offers",
    async (contentType) => {
      const admin = await makeUser({ role: "admin" });
      const instructor = await makeUser({ role: "instructor" });
      const { lesson } = await makeContent(instructor);

      const res = await put(
        admin,
        `/lessons/${lesson.id}`,
        lessonPayload({ content_type: contentType })
      );

      expectOk(res);
      expect(res.body.content_type).toBe(contentType);
    }
  );

  it("turns the Published switch off, and back on", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { lesson } = await makeContent(instructor);

    const off = await put(
      admin,
      `/lessons/${lesson.id}`,
      lessonPayload({ is_published: false })
    );
    expectOk(off);
    expect(off.body.is_published).toBe(false);
    expect((await Lesson.findById(lesson._id)).is_published).toBe(false);

    const on = await put(admin, `/lessons/${lesson.id}`, lessonPayload());
    expectOk(on);
    expect(on.body.is_published).toBe(true);
  });

  /**
   * A switch that leaves the lesson on the student's timeline is a switch
   * that does nothing. The field was not stored at all before this, so there
   * was nothing for the reads to honour.
   */
  it("hides a draft lesson from students and keeps it for staff", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course, module, lesson } = await makeContent(instructor);
    const { childUser: child } = await makeFamily();
    const student = await Student.findOne({ user_id: child._id });
    await Enrollment.create({
      student_id: student._id,
      course_id: course._id,
      status: "active",
    });

    await put(admin, `/lessons/${lesson.id}`, lessonPayload({ is_published: false }));

    const asStudent = await request(server)
      .get(`/modules/${module.id}/lessons`)
      .set(auth(child));
    expect(asStudent.status).toBe(200);
    expect(asStudent.body).toHaveLength(0);

    // And not by its own URL either — a link handed out last week must not
    // still open content that has been taken down.
    const direct = await request(server)
      .get(`/lessons/${lesson.id}`)
      .set(auth(child));
    expect(direct.status).toBe(404);

    const asStaff = await request(server)
      .get(`/modules/${module.id}/lessons`)
      .set(auth(instructor));
    expect(asStaff.body).toHaveLength(1);
  });

  /**
   * The count on a course card is the same claim as the list, in a number.
   * It read twelve while the child could open ten, which is the Published
   * switch leaking through a figure instead of through the lessons.
   */
  it("leaves a draft out of the course's lesson count", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course, lesson } = await makeContent(instructor);

    const before = await request(server).get("/courses").set(auth(admin));
    const beforeCount = before.body.find(
      (c) => c.id === String(course._id)
    ).lessons_count;

    await put(admin, `/lessons/${lesson.id}`, { is_published: false });

    const after = await request(server).get("/courses").set(auth(admin));
    expect(
      after.body.find((c) => c.id === String(course._id)).lessons_count
    ).toBe(beforeCount - 1);
  });

  it("refuses an instructor editing another instructor's lesson", async () => {
    const mine = await makeUser({ role: "instructor" });
    const theirs = await makeUser({ role: "instructor" });
    const { lesson } = await makeContent(theirs);

    const res = await put(mine, `/lessons/${lesson.id}`, lessonPayload());

    expect(res.status).toBe(403);
  });

  it("404s for a lesson that does not exist", async () => {
    const admin = await makeUser({ role: "admin" });
    const res = await put(admin, `/lessons/${missingId()}`, lessonPayload());
    expect(res.status).toBe(404);
  });

  it("deletes a lesson", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { lesson } = await makeContent(instructor);

    expectOk(await del(admin, `/lessons/${lesson.id}`));
    expect(await Lesson.findById(lesson._id)).toBeNull();
  });
});

// ── Modules ─────────────────────────────────────────────────────────────────

describe("the Edit Module modal", () => {
  const modulePayload = (over = {}) => ({
    title: "Getting Started with Scratch",
    description: "The first week: the stage, sprites and the block palette.",
    order_index: 1,
    ...over,
  });

  it("renames a module and stores its description", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { module } = await makeContent(instructor);

    const res = await put(admin, `/modules/${module.id}`, modulePayload());

    expectOk(res);
    expect(res.body.title).toBe("Getting Started with Scratch");
    expect(res.body.description).toContain("The first week");
    const stored = await Module.findById(module._id);
    expect(stored.title).toBe("Getting Started with Scratch");
  });

  /**
   * The arrows in the editor. They used to reorder React state alone, so the
   * order students saw never changed and the next page load undid the move.
   */
  /**
   * The Add Module form's position field defaults to 1, so adding a second
   * module without touching it used to ask for position 1 again — and two
   * modules at position 1 made the editor's arrows a no-op, because a swap
   * of 1 with 1 changes nothing and still answers 200.
   */
  it("puts a second module after the first, not on top of it", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);

    const second = await post(admin, "/modules", {
      course_id: String(course._id),
      title: "Basic Blocks",
      order_index: 1,
    });

    expectOk(second, 201);
    expect(second.body.order_index).toBe(2);
  });

  it("swaps two modules rather than leaving a hole", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course, module } = await makeContent(instructor);
    const second = await Module.create({
      course_id: course._id,
      title: "Basic Blocks",
      order_index: 2,
    });

    const res = await put(admin, `/modules/${module.id}`, { order_index: 2 });

    expectOk(res);
    expect(res.body.order_index).toBe(2);
    expect((await Module.findById(second._id)).order_index).toBe(1);
  });

  it("carries the description through to the course editor", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course, module } = await makeContent(instructor);

    await put(admin, `/modules/${module.id}`, modulePayload());
    const editor = await request(server)
      .get(`/admin/courses/${course.id}/editor`)
      .set(auth(admin));

    expectOk(editor);
    expect(editor.body.modules[0].description).toContain("The first week");
  });

  it("refuses an instructor editing another instructor's module", async () => {
    const mine = await makeUser({ role: "instructor" });
    const theirs = await makeUser({ role: "instructor" });
    const { module } = await makeContent(theirs);

    const res = await put(mine, `/modules/${module.id}`, modulePayload());

    expect(res.status).toBe(403);
  });

  it("404s for a module that does not exist", async () => {
    const admin = await makeUser({ role: "admin" });
    const res = await put(admin, `/modules/${missingId()}`, modulePayload());
    expect(res.status).toBe(404);
  });

  /** Deleting a module takes its lessons with it, which is why it confirms. */
  it("deletes a module and everything inside it", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { module, lesson } = await makeContent(instructor);

    expectOk(await del(admin, `/modules/${module.id}`));

    expect(await Module.findById(module._id)).toBeNull();
    expect(await Lesson.findById(lesson._id)).toBeNull();
  });
});

// ── Courses ─────────────────────────────────────────────────────────────────

describe("the Edit Course modal", () => {
  /** From `onSubmit` in EditCourseModal: the form's values plus two of its own. */
  const coursePayload = (instructorId, over = {}) => ({
    title: "Scratch Programming",
    description: "Visual programming for beginners",
    programme_track: "Scratch Programming",
    instructor_id: instructorId,
    status: "published",
    price: 15000,
    payment_type: "one_time",
    instructor_name: "Ms. Sarah Aliyu",
    thumbnail_url: null,
    ...over,
  });

  it("saves the payload the edit modal sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);

    const res = await put(
      admin,
      `/admin/courses/${course.id}`,
      coursePayload(String(instructor._id), { title: "Scratch, Renamed" })
    );

    expectOk(res);
    expect(res.body.title).toBe("Scratch, Renamed");
  });

  it("moves a course to another live track", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);

    const res = await put(
      admin,
      `/admin/courses/${course.id}`,
      coursePayload(String(instructor._id), { programme_track: "Robotics" })
    );

    expectOk(res);
    expect((await Course.findById(course._id)).programme_track).toBe("robotics");
  });

  /**
   * A track that has been archived is not offered on the forms, so a request
   * naming one is either a stale form or a client that made it up. Either way
   * the answer names the field, so the form can light up the right input.
   */
  it("refuses a move to an archived track, naming the field", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);
    await Track.updateOne({ slug: "robotics" }, { status: "archived" });

    const res = await put(
      admin,
      `/admin/courses/${course.id}`,
      coursePayload(String(instructor._id), { programme_track: "Robotics" })
    );

    expect(res.status).toBe(400);
    expect(res.body.fields.programme_track).toMatch(/archived/i);
  });

  /** Its own track, unchanged, even once archived: only a *move* is blocked. */
  it("lets a course on an archived track be edited otherwise", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);
    await Track.updateOne({ slug: "scratch" }, { status: "archived" });

    const res = await put(
      admin,
      `/admin/courses/${course.id}`,
      coursePayload(String(instructor._id), { title: "Still Editable" })
    );

    expectOk(res);
    expect(res.body.title).toBe("Still Editable");
  });

  it("deletes a course", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);

    expectOk(await del(admin, `/admin/courses/${course.id}`));
    expect(await Course.findById(course._id)).toBeNull();
  });
});

// ── Users ───────────────────────────────────────────────────────────────────

describe("the Edit User modal", () => {
  /** From `payloadFor` in CreateUserModal, in its editing branch. */
  const staffPayload = (over = {}) => ({
    name: "Mr Danjuma",
    role: "instructor",
    email: "danjuma@kidsintech.school",
    bio: "Teaches robotics on Saturdays.",
    ...over,
  });

  it("saves the staff payload the modal sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await put(
      admin,
      `/admin/users/${teacher.id}`,
      staffPayload({ name: "Mr Danjuma Bello" })
    );

    expectOk(res);
    expect(res.body.name).toBe("Mr Danjuma Bello");
  });

  it("saves the pupil payload, age and track included", async () => {
    const admin = await makeUser({ role: "admin" });
    const { childUser: child } = await makeFamily();

    const res = await put(admin, `/admin/users/${child.id}`, {
      name: "Amara Okafor",
      role: "student",
      email: null,
      bio: null,
      age: 11,
      programme_track: "Robotics",
    });

    expectOk(res);
    const student = await Student.findOne({ user_id: child._id });
    expect(student.age).toBe(11);
    expect(student.programme_track).toBe("robotics");
  });

  it("refuses an instructor editing a user", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const other = await makeUser({ role: "instructor" });

    const res = await put(teacher, `/admin/users/${other.id}`, staffPayload());

    expect(res.status).toBe(403);
  });
});

// ── Assessment ──────────────────────────────────────────────────────────────

describe("the assessment edit modals", () => {
  async function makeQuiz(instructor) {
    const { course, module } = await makeContent(instructor);
    const quiz = await Quiz.create({
      course_id: course._id,
      module_id: module._id,
      title: "Module 1 Quiz",
      order_index: 1,
      questions: [
        {
          question_text: "What is a sprite?",
          question_type: "mcq",
          options: ["A character", "A drink", "A block", "A stage"],
          correct_answer: "A character",
        },
      ],
    });
    return { course, module, quiz };
  }

  /** From `handleSave` in EditQuizModal: every question rebuilt in full. */
  it("saves the quiz payload the edit modal sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { quiz } = await makeQuiz(instructor);

    const res = await put(admin, `/quizzes/${quiz.id}`, {
      title: "Module 1 Quiz, revised",
      questions: [
        {
          question_text: "What is the stage?",
          question_type: "mcq",
          options: ["Where sprites perform", "A block", "A costume", "A sound"],
          correct_answer: "Where sprites perform",
        },
      ],
    });

    expectOk(res);
    const stored = await Quiz.findById(quiz._id);
    expect(stored.title).toBe("Module 1 Quiz, revised");
    expect(stored.questions[0].question_text).toBe("What is the stage?");
  });

  it("deletes a quiz", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { quiz } = await makeQuiz(instructor);

    expectOk(await del(admin, `/quizzes/${quiz.id}`));
    expect(await Quiz.findById(quiz._id)).toBeNull();
  });

  /**
   * From `onSubmit` in EditAssignmentModal, which sends four fields of its
   * own alongside the form's — including `submissions`, the list it is
   * holding for its own display.
   */
  it("saves the assignment payload the edit modal sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course, module } = await makeContent(instructor);
    const assignment = await Assignment.create({
      course_id: course._id,
      module_id: module._id,
      title: "Build an animation",
      description: "Make the cat walk.",
      deadline: new Date("2026-12-01T12:00:00Z"),
    });

    const res = await put(admin, `/assignments/${assignment.id}`, {
      title: "Build a walking animation",
      instructions: "Make the cat walk across the stage.",
      deadline: "2026-12-08T12:00:00.000Z",
      module_id: String(module._id),
      course_id: String(course._id),
      course_title: "Scratch Programming",
      submissions: [],
    });

    expectOk(res);
    expect((await Assignment.findById(assignment._id)).title).toBe(
      "Build a walking animation"
    );
  });
});

// ── Sessions ────────────────────────────────────────────────────────────────

describe("the session form modal", () => {
  /** From `onSubmit` in SessionFormModal, which builds the same body for both verbs. */
  it("saves the payload the session form sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);
    const session = await Session.create({
      course_id: course._id,
      instructor_id: instructor._id,
      title: "Week 3",
      scheduled_at: new Date("2026-12-01T15:00:00Z"),
      duration_minutes: 60,
    });

    const res = await put(admin, `/sessions/${session.id}`, {
      course_id: String(course._id),
      title: "Week 3 — Loops",
      session_number: 3,
      scheduled_at: "2026-12-02T15:00:00.000Z",
      duration_minutes: 90,
      description: "Repeat blocks and forever loops.",
      join_url: "https://meet.test/kit-week-3",
      max_students: 12,
      is_published: true,
    });

    expectOk(res);
    expect((await Session.findById(session._id)).title).toBe("Week 3 — Loops");
  });
});

// ── Settings ────────────────────────────────────────────────────────────────

describe("the platform settings screen", () => {
  /**
   * Each field saves on its own, so each is a one-key body. A schema that
   * required the others would refuse all three.
   */
  it.each([
    ["platform_name", { platform_name: "Kids In Tech Sokoto" }],
    ["welcome_message", { welcome_message: "Welcome back!" }],
    ["primary_color", { primary_color: "#10B981" }],
  ])("saves %s on its own", async (_field, body) => {
    const admin = await makeUser({ role: "admin" });

    const res = await post(admin, "/platform/settings", body);

    expectOk(res);
  });
});

// ── Tracks ──────────────────────────────────────────────────────────────────

describe("the Programme Tracks screen", () => {
  it("lists the tracks the forms offer", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/tracks").set(auth(admin));

    expectOk(res);
    expect(res.body.map((t) => t.slug)).toContain("scratch");
  });

  it("offers active tracks to the forms and all of them to the admin page", async () => {
    const admin = await makeUser({ role: "admin" });
    await Track.updateOne({ slug: "advanced" }, { status: "archived" });

    const forForms = await request(server).get("/tracks").set(auth(admin));
    const forAdmin = await request(server)
      .get("/tracks?include_archived=1")
      .set(auth(admin));

    expect(forForms.body.map((t) => t.slug)).not.toContain("advanced");
    expect(forAdmin.body.map((t) => t.slug)).toContain("advanced");
  });

  /** A parent's "add a child" form needs the list too, so every role may read it. */
  it.each(["instructor", "parent", "student"])(
    "lets a %s read the tracks their form offers",
    async (role) => {
      const user = await makeUser({ role });
      const res = await request(server).get("/tracks").set(auth(user));
      expect(res.status).toBe(200);
    }
  );

  it("opens a new track and lets a course be filed under it", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });

    const created = await post(admin, "/admin/tracks", {
      name: "Drone Engineering",
      description: "Flight, sensors and safety.",
    });
    expectOk(created, 201);
    expect(created.body.slug).toBe("drone-engineering");

    const course = await post(admin, "/courses", {
      title: "Drones for Beginners",
      description: "Learn to fly safely",
      programme_track: "Drone Engineering",
      instructor_id: String(instructor._id),
      status: "draft",
      price: 20000,
      payment_type: "one_time",
    });

    expectOk(course, 201);
    expect(course.body.programme_track).toBe("Drone Engineering");
  });

  it("refuses a second track with the same name", async () => {
    const admin = await makeUser({ role: "admin" });

    await post(admin, "/admin/tracks", { name: "Drone Engineering" });
    const again = await post(admin, "/admin/tracks", {
      name: "drone engineering",
    });

    expect(again.status).toBe(409);
  });

  /**
   * The slug is what every course and student stores, so a rename must not
   * move it — otherwise renaming a track orphans everything filed under it.
   */
  it("renames a track without moving what is filed under it", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const { course } = await makeContent(instructor);
    const track = await Track.findOne({ slug: "scratch" });

    const res = await put(admin, `/admin/tracks/${track.id}`, {
      name: "Scratch & Game Design",
    });

    expectOk(res);
    expect(res.body.slug).toBe("scratch");
    expect((await Course.findById(course._id)).programme_track).toBe("scratch");
    // And the course now renders under the new name.
    const courses = await request(server).get("/courses").set(auth(admin));
    expect(courses.body[0].programme_track).toBe("Scratch & Game Design");
  });

  it("archives a track, taking it off the forms", async () => {
    const admin = await makeUser({ role: "admin" });
    const track = await Track.findOne({ slug: "advanced" });

    const res = await put(admin, `/admin/tracks/${track.id}`, {
      status: "archived",
    });

    expectOk(res);
    const offered = await request(server).get("/tracks").set(auth(admin));
    expect(offered.body.map((t) => t.slug)).not.toContain("advanced");
  });

  it("refuses to delete a track a course is filed under", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    await makeContent(instructor);
    const track = await Track.findOne({ slug: "scratch" });

    const res = await del(admin, `/admin/tracks/${track.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/archive it instead/i);
    expect(await Track.findById(track._id)).not.toBeNull();
  });

  it("refuses to delete a track a student is on", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeFamily({ childOverrides: { programme_track: "scratch" } });
    const track = await Track.findOne({ slug: "scratch" });

    const res = await del(admin, `/admin/tracks/${track.id}`);

    expect(res.status).toBe(409);
  });

  it("deletes a track nothing points at", async () => {
    const admin = await makeUser({ role: "admin" });
    const created = await post(admin, "/admin/tracks", { name: "Unused Track" });

    const res = await del(admin, `/admin/tracks/${created.body.id}`);

    expectOk(res);
    expect(await Track.findOne({ slug: "unused-track" })).toBeNull();
  });

  it.each(["instructor", "parent", "student"])(
    "refuses a %s creating a track",
    async (role) => {
      const user = await makeUser({ role });
      const res = await post(user, "/admin/tracks", { name: "Sneaky Track" });
      expect(res.status).toBe(403);
    }
  );

  it("writes an audit row for every track change", async () => {
    const admin = await makeUser({ role: "admin" });
    const { ActivityLog } = await import("../src/models/ActivityLog.js");

    const created = await post(admin, "/admin/tracks", { name: "Audited Track" });
    await put(admin, `/admin/tracks/${created.body.id}`, { name: "Renamed" });
    await del(admin, `/admin/tracks/${created.body.id}`);

    const actions = (await ActivityLog.find({ target_type: "track" })).map(
      (row) => row.action
    );
    expect(actions).toEqual(
      expect.arrayContaining(["create_track", "update_track", "delete_track"])
    );
  });

  it("404s for a track that does not exist", async () => {
    const admin = await makeUser({ role: "admin" });

    expect((await put(admin, `/admin/tracks/${missingId()}`, { name: "Renamed" })).status).toBe(404);
    expect((await del(admin, `/admin/tracks/${missingId()}`)).status).toBe(404);
  });
});
