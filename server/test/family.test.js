import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Student } from "../src/models/Student.js";
import { Consent } from "../src/models/Consent.js";
import { Notification } from "../src/models/Notification.js";

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
      // Progress arrives in Batch 2.
      expect(child.enrolled_courses).toBe(0);
      expect(child.completed_courses).toBe(0);
    }
  });

  it("returns an empty list for a parent with no children", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server).get("/parents/me/children").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
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
