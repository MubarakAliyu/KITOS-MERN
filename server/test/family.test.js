import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Student } from "../src/models/Student.js";
import { Consent } from "../src/models/Consent.js";
import { Notification } from "../src/models/Notification.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Lesson } from "../src/models/Lesson.js";
import { Module } from "../src/models/Module.js";

const server = app();

const childBody = (overrides = {}) => ({
  name: "Zara Hassan",
  age: 10,
  programme_track: "Scratch Programming",
  consent: { version: "1.0", accepted: true },
  ...overrides,
});

beforeEach(resetState);

describe("POST /students — a parent adds a child", () => {
  it("creates the account, the profile and the consent record together", async () => {
    const parent = await makeUser({ role: "parent", name: "Parent One" });

    const res = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody());

    expect(res.status).toBe(201);
    expect(res.body.admission_no).toMatch(/^KIT\/\d{2}\/\d{3,4}$/);
    expect(res.body.password).toBeTruthy();
    expect(res.body.status).toBe("active");
    // The label the frontend renders, not the stored slug.
    expect(res.body.programme_track).toBe("Scratch Programming");
    expect(res.body.avatar_initial).toBe("Z");

    const student = await Student.findById(res.body.id);
    expect(student.programme_track).toBe("scratch");
    expect(String(student.parent_id)).toBe(String(parent._id));

    const account = await User.findById(student.user_id);
    expect(account.role).toBe("student");
    expect(account.must_reset_password).toBe(true);
    // Children need no email address (child-safety rule).
    expect(account.email).toBeUndefined();

    const consent = await Consent.findOne({ student_id: student._id });
    expect(consent.version).toBe("1.0");
    expect(String(consent.parent_id)).toBe(String(parent._id));
    expect(consent.accepted_at).toBeInstanceOf(Date);
    expect(String(student.consent_id)).toBe(String(consent._id));
  });

  it("records the consent ip and user agent as evidence", async () => {
    const parent = await makeUser({ role: "parent" });

    await request(server)
      .post("/students")
      .set(auth(parent))
      .set("User-Agent", "KIT-Test-Browser/1.0")
      .send(childBody());

    const consent = await Consent.findOne({});
    expect(consent.user_agent).toBe("KIT-Test-Browser/1.0");
    expect(consent.ip).toBeTruthy();
  });

  it("refuses when consent is not accepted", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ consent: { version: "1.0", accepted: false } }));

    expect(res.status).toBe(400);
    expect(res.body.fields["consent.accepted"]).toBeTruthy();
    // Nothing was written.
    expect(await Student.countDocuments({})).toBe(0);
    expect(await User.countDocuments({ role: "student" })).toBe(0);
  });

  it("refuses when the consent block is missing altogether", async () => {
    const parent = await makeUser({ role: "parent" });
    const body = childBody();
    delete body.consent;

    const res = await request(server).post("/students").set(auth(parent)).send(body);

    expect(res.status).toBe(400);
    expect(await Student.countDocuments({})).toBe(0);
  });

  it("enforces the 8 to 18 age range", async () => {
    const parent = await makeUser({ role: "parent" });

    for (const age of [7, 19, 0, -1]) {
      const res = await request(server)
        .post("/students")
        .set(auth(parent))
        .send(childBody({ age }));
      expect(res.status).toBe(400);
      expect(res.body.fields.age).toBeTruthy();
    }

    for (const age of [8, 18]) {
      const res = await request(server)
        .post("/students")
        .set(auth(parent))
        .send(childBody({ age, name: `Edge ${age}` }));
      expect(res.status).toBe(201);
    }
  });

  it("refuses an unknown programme track", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ programme_track: "Underwater Basket Weaving" }));

    expect(res.status).toBe(400);
  });

  it("accepts a track as either a slug or the label the form submits", async () => {
    const parent = await makeUser({ role: "parent" });

    const slug = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ programme_track: "web-development", name: "Slug Child" }));
    expect(slug.status).toBe(201);
    expect(slug.body.programme_track).toBe("Web Development");

    const label = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ programme_track: "Web Development", name: "Label Child" }));
    expect(label.status).toBe(201);
  });

  it("notifies every administrator", async () => {
    const parent = await makeUser({ role: "parent", name: "Telling Parent" });
    const adminA = await makeUser({ role: "admin" });
    const adminB = await makeUser({ role: "admin" });

    await request(server).post("/students").set(auth(parent)).send(childBody());

    const notifications = await Notification.find({ type: "child_added" });
    const recipients = notifications.map((n) => String(n.user_id)).sort();
    expect(recipients).toEqual([String(adminA._id), String(adminB._id)].sort());
  });

  it("lets the new child sign in and forces a password reset", async () => {
    const parent = await makeUser({ role: "parent" });

    const created = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody());

    const signIn = await request(server)
      .post("/login")
      .send({ email: created.body.admission_no, password: created.body.password });

    expect(signIn.status).toBe(200);
    expect(signIn.body.must_reset_password).toBe(true);
    expect(signIn.body.temp_token).toBeTruthy();
    expect(signIn.body.access).toBeUndefined();

    // Choosing a password completes the flow.
    const reset = await request(server)
      .post("/user/change-password")
      .send({ temp_token: signIn.body.temp_token, new_password: "ChildPass123" });
    expect(reset.status).toBe(200);

    const second = await request(server)
      .post("/login")
      .send({ email: created.body.admission_no, password: "ChildPass123" });
    expect(second.status).toBe(200);
    expect(second.body.access).toBeTruthy();
  });

  it("gives consecutive children consecutive admission numbers", async () => {
    const parent = await makeUser({ role: "parent" });

    const first = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ name: "First Child" }));
    const second = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ name: "Second Child" }));

    const seq = (n) => Number(n.split("/")[2]);
    expect(seq(second.body.admission_no)).toBe(seq(first.body.admission_no) + 1);
  });

  it("rejects unknown fields rather than silently dropping them", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/students")
      .set(auth(parent))
      .send(childBody({ is_active: false, role: "admin" }));

    expect(res.status).toBe(400);
  });
});

describe("GET /parents/me and /parents/me/children", () => {
  it("returns the parent profile with id equal to user_id", async () => {
    const parent = await makeUser({ role: "parent", name: "Profile Parent" });

    const res = await request(server).get("/parents/me").set(auth(parent));

    expect(res.status).toBe(200);
    // There is no parents collection; a parent is a User (ADR-013).
    expect(res.body.id).toBe(String(parent._id));
    expect(res.body.user_id).toBe(String(parent._id));
    expect(res.body.name).toBe("Profile Parent");
  });

  it("lists children oldest-added first with their admission numbers", async () => {
    const parent = await makeUser({ role: "parent" });
    await request(server).post("/students").set(auth(parent)).send(childBody({ name: "Alpha Child" }));
    await request(server).post("/students").set(auth(parent)).send(childBody({ name: "Beta Child" }));

    const res = await request(server).get("/parents/me/children").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name)).toEqual(["Alpha Child", "Beta Child"]);
    for (const child of res.body) {
      expect(child.admission_no).toMatch(/^KIT\/\d{2}\/\d{3,4}$/);
      // Neither child is on a course yet, so zero is the truth here.
      expect(child.enrolled_courses).toBe(0);
      expect(child.completed_courses).toBe(0);
    }
  });

  it("counts each child's courses, and the ones they finished", async () => {
    const { parent, student } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });

    const [active, done] = await Promise.all([
      Course.create({
        title: "In progress",
        programme_track: "scratch",
        instructor_id: instructor._id,
        status: "published",
      }),
      Course.create({
        title: "Finished",
        programme_track: "robotics",
        instructor_id: instructor._id,
        status: "published",
      }),
    ]);

    await Enrollment.create({
      student_id: student._id,
      course_id: active._id,
      status: "active",
      progress: 40,
    });
    await Enrollment.create({
      student_id: student._id,
      course_id: done._id,
      status: "completed",
      progress: 100,
    });

    const res = await request(server).get("/parents/me/children").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body[0].enrolled_courses).toBe(2);
    expect(res.body[0].completed_courses).toBe(1);
  });

  it("returns an empty list for a parent with no children", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server).get("/parents/me/children").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /students/:id/progress", () => {
  /** A published course with one lesson, taught by `instructor`. */
  async function courseWithLesson(instructor, title) {
    const course = await Course.create({
      title,
      programme_track: "scratch",
      instructor_id: instructor._id,
      status: "published",
    });
    const module = await Module.create({
      course_id: course._id,
      title: "Module One",
      order_index: 1,
    });
    await Lesson.create({
      module_id: module._id,
      course_id: course._id,
      title: "Lesson One",
      content_type: "text",
      body_content: "<p>Hello</p>",
      order_index: 1,
    });
    return course;
  }

  it("gives a parent their child's per-course progress", async () => {
    const { parent, student, childUser } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    const course = await courseWithLesson(instructor, "Scratch Basics");

    await Enrollment.create({
      student_id: student._id,
      course_id: course._id,
      status: "active",
    });

    // Before: on the course, nothing done.
    let res = await request(server)
      .get(`/students/${student._id}/progress`)
      .set(auth(parent));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].course_title).toBe("Scratch Basics");
    expect(res.body[0].progress).toBe(0);

    // The child does the only lesson.
    const lesson = await Lesson.findOne({ course_id: course._id });
    await request(server).post(`/lessons/${lesson._id}/complete`).set(auth(childUser));

    // After: the parent sees it, which is the point of the screen.
    res = await request(server).get(`/students/${student._id}/progress`).set(auth(parent));
    expect(res.body[0].progress).toBe(100);
    expect(res.body[0].modules_completed).toBe(1);
    expect(res.body[0].modules_total).toBe(1);
    expect(res.body[0].status).toBe("completed");
  });

  it("refuses a parent asking about someone else's child", async () => {
    const { student } = await makeFamily();
    const stranger = await makeUser({ role: "parent" });

    const res = await request(server)
      .get(`/students/${student._id}/progress`)
      .set(auth(stranger));

    expect(res.status).toBe(403);
  });

  /**
   * ADR-014 deferred this narrowing to Batch 2, when there would be
   * enrolments to narrow by. A teacher of the robotics class has no business
   * reading the progress of a child they have never taught.
   */
  it("lets an instructor see only a child on one of their own courses", async () => {
    const { student } = await makeFamily();
    const theirs = await makeUser({ role: "instructor" });
    const other = await makeUser({ role: "instructor" });

    const course = await courseWithLesson(theirs, "Their Course");
    await Enrollment.create({
      student_id: student._id,
      course_id: course._id,
      status: "active",
    });

    const allowed = await request(server)
      .get(`/students/${student._id}/progress`)
      .set(auth(theirs));
    expect(allowed.status).toBe(200);

    const refused = await request(server)
      .get(`/students/${student._id}/progress`)
      .set(auth(other));
    expect(refused.status).toBe(403);
  });
});

describe("GET /students/me", () => {
  it("returns the student profile keyed on the student document id", async () => {
    const { childUser, student } = await makeFamily();

    const res = await request(server).get("/students/me").set(auth(childUser));

    expect(res.status).toBe(200);
    // /students/:id/progress is keyed on this id, not the user id.
    expect(res.body.id).toBe(String(student._id));
    expect(res.body.parent_id).toBeTruthy();
    expect(res.body.admission_no).toBe(childUser.admission_no);
  });

  it("404s for a student account with no learning profile", async () => {
    const orphan = await makeUser({ role: "student", admission_no: "KIT/26/499" });

    const res = await request(server).get("/students/me").set(auth(orphan));

    expect(res.status).toBe(404);
  });
});

describe("GET /instructors/me", () => {
  it("returns the instructor profile with the initial after any honorific", async () => {
    const instructor = await makeUser({
      role: "instructor",
      name: "Ms. Sarah Aliyu",
      bio: "Teaches Scratch.",
    });

    const res = await request(server).get("/instructors/me").set(auth(instructor));

    expect(res.status).toBe(200);
    // "M" would be wrong: the fixture expects "S".
    expect(res.body.avatar_initial).toBe("S");
    expect(res.body.bio).toBe("Teaches Scratch.");
    expect(res.body.id).toBe(String(instructor._id));
    expect(res.body.user_id).toBe(String(instructor._id));
  });

  it("counts their courses and their distinct pupils", async () => {
    const instructor = await makeUser({ role: "instructor" });
    const [one, two] = await Promise.all([
      Course.create({
        title: "Course One",
        programme_track: "scratch",
        instructor_id: instructor._id,
        status: "published",
      }),
      Course.create({
        title: "Course Two",
        programme_track: "advanced",
        instructor_id: instructor._id,
        status: "published",
      }),
    ]);

    const { student } = await makeFamily();
    // The same child on both courses is one child, not two.
    await Enrollment.create({
      student_id: student._id,
      course_id: one._id,
      status: "active",
    });
    await Enrollment.create({
      student_id: student._id,
      course_id: two._id,
      status: "active",
    });

    const res = await request(server).get("/instructors/me").set(auth(instructor));

    expect(res.status).toBe(200);
    expect(res.body.courses_count).toBe(2);
    expect(res.body.students_count).toBe(1);
  });
});

describe("own profile", () => {
  it("updates a name and phone for staff", async () => {
    const instructor = await makeUser({ role: "instructor", name: "Old Name" });

    const res = await request(server)
      .put("/user/profile")
      .set(auth(instructor))
      .send({ name: "New Name", phone: "+234 800 000 0000" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    expect((await User.findById(instructor._id)).name).toBe("New Name");
  });

  it("will not let a student rename themselves", async () => {
    const { childUser } = await makeFamily();

    const res = await request(server)
      .put("/user/profile")
      .set(auth(childUser))
      .send({ name: "Hacker Name" });

    expect(res.status).toBe(200);
    // The name is on their certificates and their parent's dashboard.
    expect((await User.findById(childUser._id)).name).toBe(childUser.name);
  });

  it("saves a language preference", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .put("/user/language")
      .set(auth(parent))
      .send({ language_preference: "ha" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, language_preference: "ha" });
    expect((await User.findById(parent._id)).language_preference).toBe("ha");
  });

  it("refuses an unknown language code", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .put("/user/language")
      .set(auth(parent))
      .send({ language_preference: "fr" });

    expect(res.status).toBe(400);
  });
});

describe("pending enrolments", () => {
  it("lists children who are still waiting on consent", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeFamily({ consented: false, childOverrides: { name: "Waiting Child" } });
    await makeFamily({ consented: true, childOverrides: { name: "Active Child" } });

    const res = await request(server)
      .get("/admin/pending-enrollments")
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].child_name).toBe("Waiting Child");
    expect(res.body[0].status).toBe("pending_enrollment");
    expect(res.body[0].parent_name).toBeTruthy();
  });
});
