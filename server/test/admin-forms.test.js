import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import {
  app,
  makeUser,
  makeFamily,
  auth,
  resetState,
  missingId,
  PASSWORD,
} from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Module } from "../src/models/Module.js";
import { Assignment } from "../src/models/Assignment.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { ActivityLog } from "../src/models/ActivityLog.js";
import { resetEnvCache } from "../src/config/env.js";

/**
 * Every admin and instructor write, posted with **the exact payload its form
 * builds** (Batch 3, production fix).
 *
 * Nine of sixteen admin writes answered 400 on the live site while the server
 * suite was green, which is the fact this file exists to stop repeating. The
 * other tests construct minimal valid bodies by hand, so they only ever
 * exercised the happy path the schema was written against; nothing sent what
 * a browser actually sends. Three things went wrong at once:
 *
 *   - forms post keys the API never named, and `.strict()` refuses the whole
 *     request over one of them (`bio`, `instructor_name`, `thumbnail_url`);
 *   - a field a form hides for the chosen role is still in its state and
 *     still submitted, as `""` or `0` — so an instructor was created with
 *     `age: 0` and refused for being outside 8 to 18;
 *   - and two fields the API requires were on no form at all, so a pupil
 *     could not be given a parent nor a course a track.
 *
 * The payloads below are copied from the modals. When a form changes, change
 * them here — a payload that has drifted from its form tests nothing.
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

/** Fails with the server's own message, which is the useful half. */
function expectOk(res, expected = 201) {
  if (res.status !== expected) {
    throw new Error(
      `expected ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
}

describe("the Add User modal", () => {
  /**
   * The exact payload, from `payloadFor` in CreateUserModal: a pupil carries
   * age, track and parent; nobody else does.
   */
  const studentPayload = (parentId, over = {}) => ({
    name: "Amara Okafor",
    role: "student",
    email: null,
    bio: null,
    age: 10,
    programme_track: "Robotics Basics",
    parent_id: parentId,
    ...over,
  });

  const staffPayload = (role, over = {}) => ({
    name: role === "parent" ? "Mrs Bello" : "Mr Danjuma",
    role,
    email: `${role}.form@example.com`,
    bio: null,
    ...over,
  });

  it("creates a pupil with no email address", async () => {
    const admin = await makeUser({ role: "admin" });
    const { parent } = await makeFamily();

    const res = await post(admin, "/admin/users", studentPayload(String(parent._id)));

    expectOk(res);
    expect(res.body.admission_no).toMatch(/^KIT\/\d{2}\/\d{3}$/);
    // A pupil signs in with that number; an address is not required of a
    // child, and `null` is how the form says "none".
    expect(res.body.email ?? null).toBeNull();
  });

  it("accepts the bio the modal collects", async () => {
    const admin = await makeUser({ role: "admin" });
    const { parent } = await makeFamily();

    const res = await post(
      admin,
      "/admin/users",
      studentPayload(String(parent._id), { bio: "Loves robots" })
    );

    expectOk(res);
    const created = await User.findById(res.body.id);
    expect(created.bio).toBe("Loves robots");
  });

  it.each(["instructor", "parent", "admin"])(
    "creates a %s without age or programme track",
    async (role) => {
      const admin = await makeUser({ role: "admin" });

      // The form omits both for a non-pupil. It used to send `age: 0` and
      // `programme_track: ""`, and the API refused the age.
      const res = await post(admin, "/admin/users", staffPayload(role));

      expectOk(res);
      expect(res.body.role).toBe(role);
    }
  );

  it("refuses a pupil with no parent, naming the field", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await post(admin, "/admin/users", {
      name: "Unlinked Child",
      role: "student",
      email: null,
      bio: null,
      age: 10,
      programme_track: "Robotics Basics",
      parent_id: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.fields?.parent_id).toBeTruthy();
  });

  it("still requires an email of everyone who signs in with one", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await post(admin, "/admin/users", {
      name: "No Address",
      role: "instructor",
      email: null,
      bio: null,
    });

    expect(res.status).toBe(400);
    expect(res.body.fields?.email).toMatch(/email/i);
  });

  /**
   * The password is random per account and returned once.
   *
   * Every account used to be given "default1234", which is printed in this
   * repository — anyone who could guess an admission number could sign in as
   * a child.
   */
  it("returns a random one-time password and forces a reset", async () => {
    const admin = await makeUser({ role: "admin" });
    const { parent } = await makeFamily();

    const first = await post(admin, "/admin/users", studentPayload(String(parent._id)));
    const second = await post(
      admin,
      "/admin/users",
      studentPayload(String(parent._id), { name: "Second Child" })
    );

    expectOk(first);
    expectOk(second);
    expect(first.body.temporary_password).toBeTruthy();
    expect(first.body.temporary_password).not.toBe("default1234");
    expect(first.body.temporary_password).not.toBe(
      second.body.temporary_password
    );
    expect(first.body.must_reset_password).toBe(true);

    // Returned, never stored in the clear.
    const stored = await User.findById(first.body.id).select("+password_hash");
    expect(stored.password_hash).not.toContain(first.body.temporary_password);
  });

  it("edits a user with the payload the modal sends in edit mode", async () => {
    const admin = await makeUser({ role: "admin" });
    const { student } = await makeFamily();
    const studentUser = await User.findById(student.user_id);

    const res = await put(admin, `/admin/users/${studentUser._id}`, {
      name: "Renamed Pupil",
      role: "student",
      email: null,
      bio: "Updated note",
      age: 11,
      programme_track: "Scratch Programming",
      // No parent_id: the modal sends it only when creating, because moving
      // a child between families is a custody decision rather than part of
      // renaming them.
    });

    expectOk(res, 200);
    expect(res.body.name).toBe("Renamed Pupil");
  });

  it("suspends and restores an account", async () => {
    const admin = await makeUser({ role: "admin" });
    const { student } = await makeFamily();
    const studentUser = await User.findById(student.user_id);

    expectOk(
      await post(admin, "/admin/users/deactivate", {
        user_id: String(studentUser._id),
      }),
      200
    );
    expect((await User.findById(studentUser._id)).is_active).toBe(false);

    expectOk(
      await post(admin, "/admin/users/activate", {
        user_id: String(studentUser._id),
      }),
      200
    );
    expect((await User.findById(studentUser._id)).is_active).toBe(true);
  });
});

describe("the course modals", () => {
  /** From CreateCourseModal: form values plus the two it derives. */
  const coursePayload = (instructorId, instructorName, over = {}) => ({
    title: "Robotics for Beginners",
    description: "An introduction to building and programming robots.",
    price: 20000,
    payment_type: "one_time",
    instructor_id: instructorId,
    programme_track: "Robotics Basics",
    instructor_name: instructorName,
    thumbnail_url: null,
    ...over,
  });

  it("creates a course, ignoring the name it derived for its own display", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await post(
      admin,
      "/admin/courses",
      coursePayload(String(teacher._id), teacher.name)
    );

    expectOk(res);
    const course = await Course.findById(res.body.id);
    expect(course.programme_track).toBe("robotics");
    expect(String(course.instructor_id)).toBe(String(teacher._id));
    // `instructor_name` is derived from the id and is not a stored field.
    expect(course.toObject().instructor_name).toBeUndefined();
  });

  it("stores a picked thumbnail sent as thumbnail_url", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

    const res = await post(
      admin,
      "/admin/courses",
      coursePayload(String(teacher._id), teacher.name, { thumbnail_url: dataUri })
    );

    expectOk(res);
    expect((await Course.findById(res.body.id)).thumbnail).toBe(dataUri);
  });

  it("refuses a course with no track, naming the field", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await post(
      admin,
      "/admin/courses",
      coursePayload(String(teacher._id), teacher.name, { programme_track: "" })
    );

    expect(res.status).toBe(400);
    expect(res.body.fields?.programme_track).toMatch(/track/i);
  });

  it("edits a course with the payload the edit modal sends", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });
    const created = await post(
      admin,
      "/admin/courses",
      coursePayload(String(teacher._id), teacher.name)
    );
    expectOk(created);

    const res = await put(
      admin,
      `/admin/courses/${created.body.id}`,
      coursePayload(String(teacher._id), teacher.name, {
        title: "Robotics, Renamed",
        price: 25000,
      })
    );

    expectOk(res, 200);
    expect((await Course.findById(created.body.id)).title).toBe(
      "Robotics, Renamed"
    );
  });
});

describe("the content modals", () => {
  async function courseFor(teacher) {
    return Course.create({
      title: "Host Course",
      programme_track: "scratch",
      instructor_id: teacher._id,
      status: "draft",
      price_kobo: 1500000,
    });
  }

  it("adds a module", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await courseFor(teacher);

    const res = await post(teacher, "/modules", {
      title: "Getting Started",
      order_index: 1,
      course_id: String(course._id),
    });

    expectOk(res);
  });

  it.each([
    [
      "video",
      {
        content_type: "video",
        youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        body_content: "",
      },
    ],
    [
      "text",
      { content_type: "text", youtube_url: "", body_content: "<p>Hello</p>" },
    ],
  ])("adds a %s lesson, with the other field left blank", async (_label, extra) => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await courseFor(teacher);
    const module = await Module.create({
      course_id: course._id,
      title: "M1",
      order_index: 1,
    });

    const res = await post(teacher, "/lessons", {
      title: "A Lesson",
      order_index: 1,
      module_id: String(module._id),
      ...extra,
    });

    expectOk(res);
  });

  it("adds a quiz", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await courseFor(teacher);
    const module = await Module.create({
      course_id: course._id,
      title: "M1",
      order_index: 1,
    });

    const res = await post(teacher, "/quizzes", {
      module_id: String(module._id),
      title: "Checkpoint",
      questions: [
        {
          question_text: "What is 2 + 2?",
          question_type: "mcq",
          options: ["3", "4", "5", "6"],
          correct_answer: "4",
        },
      ],
    });

    expectOk(res);
  });

  /**
   * The five marking fields the modal collects. The schema named none of
   * them, so `.strict()` refused every assignment an instructor created —
   * and they are stored rather than dropped, because an instructor who sets
   * a 50-point assignment has said something that matters.
   */
  it("adds an assignment, keeping how it is marked", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await courseFor(teacher);
    const module = await Module.create({
      course_id: course._id,
      title: "M1",
      order_index: 1,
    });

    const res = await post(teacher, "/assignments", {
      title: "Build a robot arm",
      instructions: "Follow the steps in the lesson and submit a photo.",
      submission_types: ["file", "link"],
      deadline: "2027-01-31T12:00",
      max_score: 50,
      grade_type: "percentage",
      allow_late: true,
      late_penalty: 10,
      module_id: String(module._id),
      course_id: String(course._id),
    });

    expectOk(res);
    const stored = await Assignment.findById(res.body.id);
    expect(stored.max_score).toBe(50);
    expect(stored.grade_type).toBe("percentage");
    expect(stored.allow_late).toBe(true);
    expect(stored.late_penalty).toBe(10);
    expect([...stored.submission_types]).toEqual(["file", "link"]);
  });

  it("does not reset the marking settings when only the title is edited", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await courseFor(teacher);
    const module = await Module.create({
      course_id: course._id,
      title: "M1",
      order_index: 1,
    });
    const created = await post(teacher, "/assignments", {
      title: "First",
      instructions: "Do the thing described in the lesson.",
      submission_types: ["text"],
      max_score: 30,
      grade_type: "pass_fail",
      allow_late: false,
      module_id: String(module._id),
      course_id: String(course._id),
    });
    expectOk(created);

    const res = await put(teacher, `/assignments/${created.body.id}`, {
      title: "Renamed",
    });

    expectOk(res, 200);
    const stored = await Assignment.findById(created.body.id);
    expect(stored.max_score).toBe(30);
    expect(stored.grade_type).toBe("pass_fail");
  });
});

describe("the session form", () => {
  /** From SessionFormModal's `payload`, nulls and all. */
  const sessionPayload = (courseId, over = {}) => ({
    course_id: courseId,
    title: "Week One Class",
    session_number: null,
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    duration_minutes: 60,
    description: "",
    join_url: null,
    max_students: null,
    is_published: true,
    ...over,
  });

  it("creates a session with no meeting link yet", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await Course.create({
      title: "Host Course",
      programme_track: "scratch",
      instructor_id: teacher._id,
      status: "published",
      price_kobo: 1500000,
    });

    // The form marks the link optional — an instructor books the slot now
    // and pastes the Meet link later. The API used to default the mode to
    // online and then refuse anything without one.
    const res = await post(teacher, "/sessions", sessionPayload(String(course._id)));

    expectOk(res);
    expect((await Session.findById(res.body.id)).is_published).toBe(true);
  });

  it("takes the link the form calls join_url", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await Course.create({
      title: "Host Course",
      programme_track: "scratch",
      instructor_id: teacher._id,
      status: "published",
      price_kobo: 1500000,
    });

    const res = await post(
      teacher,
      "/sessions",
      sessionPayload(String(course._id), {
        join_url: "https://meet.google.com/abc-defg-hij",
      })
    );

    expectOk(res);
    expect((await Session.findById(res.body.id)).meeting_url).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
  });

  it("still refuses an explicitly online session with no way in", async () => {
    const teacher = await makeUser({ role: "instructor" });
    const course = await Course.create({
      title: "Host Course",
      programme_track: "scratch",
      instructor_id: teacher._id,
      status: "published",
      price_kobo: 1500000,
    });

    const res = await post(
      teacher,
      "/sessions",
      sessionPayload(String(course._id), { mode: "online" })
    );

    expect(res.status).toBe(400);
    expect(res.body.fields?.meeting_url).toBeTruthy();
  });
});

/**
 * Temporary passwords: handed over once, on screen, never emailed
 * (production fix).
 *
 * Creating a user used to wait on an email. Render's free tier blocks
 * outbound SMTP, and a blocked port drops packets rather than refusing the
 * connection, so the request hung on the operating system's default socket
 * timeout — minutes — while the account sat written in the database. The
 * browser gave up first: the administrator was told "Couldn't create user"
 * about a user who existed, a retry answered 409, and the one-time password
 * went down with the response that never came.
 */
describe("temporary passwords", () => {
  it("hands the password back in the response, and emails nobody", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await post(admin, "/admin/users", {
      name: "Hauwa Bello",
      role: "instructor",
      email: "hauwa.bello@example.com",
      bio: null,
    });

    expectOk(res);
    expect(res.body.temporary_password).toMatch(/^KIT/);
    // The dialog reads either key, so both must be the same password.
    expect(res.body.password).toBe(res.body.temporary_password);
  });

  /**
   * The fix, stated as a property: no request may wait on email.
   *
   * `/forgot-password` is the remaining route that sends mail, now via
   * `sendMailInBackground`. The mail server here is a port nothing listens
   * on, which is as close as a test gets to a blocked one. Without the
   * background send and the transport timeouts, this waits as long as the
   * socket does.
   */
  it("answers a password-reset request without waiting for the mail server", async () => {
    const user = await makeUser({ role: "instructor" });

    process.env.SMTP_HOST = "127.0.0.1";
    // Nothing listens here, and nothing is going to answer.
    process.env.SMTP_PORT = "2";
    resetEnvCache();

    try {
      const started = Date.now();
      const res = await request(server)
        .post("/forgot-password")
        .send({ email: user.email });
      const elapsed = Date.now() - started;

      expect(res.status).toBe(200);
      // Well inside the browser's 20s, and nowhere near the minutes an
      // unanswered SMTP connection takes.
      expect(elapsed).toBeLessThan(5000);
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      resetEnvCache();
    }
  });

  it("issues a new temporary password and forces a change", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await post(admin, `/admin/users/${teacher._id}/reset-password`);

    expectOk(res, 200);
    expect(res.body.temporary_password).toMatch(/^KIT/);
    expect(res.body.password).toBe(res.body.temporary_password);
    expect(res.body.must_reset_password).toBe(true);

    const stored = await User.findById(teacher._id).select("+password_hash");
    expect(stored.must_reset_password).toBe(true);
    // Returned once, never stored in the clear.
    expect(stored.password_hash).not.toContain(res.body.temporary_password);
  });

  it("lets the account sign in with the new password and refuses the old one", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await post(admin, `/admin/users/${teacher._id}/reset-password`);

    const stale = await request(server)
      .post("/login")
      .send({ identifier: teacher.email, password: PASSWORD });
    expect(stale.status).toBe(401);

    const fresh = await request(server)
      .post("/login")
      .send({ identifier: teacher.email, password: res.body.password });
    expect(fresh.status).toBe(200);
    // A forced change hands back a single-purpose token, not a session.
    expect(fresh.body.must_reset_password).toBe(true);
  });

  /**
   * A reset that leaves the old sessions signed in is not a reset.
   *
   * `token_version` is `select: false`, so a service that forgets to ask for
   * it increments from `undefined` and the bump is silently lost — the
   * account's existing tokens keep working.
   */
  it("signs the account out everywhere", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });
    const before = await User.findById(teacher._id).select("+token_version");

    await post(admin, `/admin/users/${teacher._id}/reset-password`);

    const after = await User.findById(teacher._id).select("+token_version");
    expect(after.token_version).toBe((before.token_version ?? 0) + 1);

    // The token minted before the reset is now worthless.
    const res = await request(server).get("/user/me").set(auth(teacher));
    expect(res.status).toBe(401);
  });

  it("gives a different password each time", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const first = await post(
      admin,
      `/admin/users/${teacher._id}/reset-password`
    );
    const second = await post(
      admin,
      `/admin/users/${teacher._id}/reset-password`
    );

    expect(first.body.password).not.toBe(second.body.password);
  });

  it("writes an audit row naming who did it, and not the password", async () => {
    const admin = await makeUser({ role: "admin" });
    const teacher = await makeUser({ role: "instructor" });

    const res = await post(admin, `/admin/users/${teacher._id}/reset-password`);

    const entry = await ActivityLog.findOne({ action: "reset_user_password" });
    expect(entry).toBeTruthy();
    expect(entry.actor_name).toBe(admin.name);
    expect(entry.description).toContain(teacher.name);
    // The log records that a reset happened, never the credential.
    expect(JSON.stringify(entry.toObject())).not.toContain(res.body.password);
  });

  it.each(["instructor", "parent", "student"])(
    "refuses a %s resetting anyone's password",
    async (role) => {
      const actor = await makeUser({ role });
      const victim = await makeUser({ role: "instructor" });

      const res = await post(
        actor,
        `/admin/users/${victim._id}/reset-password`
      );

      expect(res.status).toBe(403);
    }
  );

  it("refuses an unauthenticated reset", async () => {
    const victim = await makeUser({ role: "instructor" });

    const res = await request(server).post(
      `/admin/users/${victim._id}/reset-password`
    );

    expect(res.status).toBe(401);
  });

  it("404s for an account that does not exist", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await post(admin, `/admin/users/${missingId()}/reset-password`);

    expect(res.status).toBe(404);
  });
});
