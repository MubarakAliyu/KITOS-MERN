import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, missingId, resetState } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Student } from "../src/models/Student.js";
import { ActivityLog } from "../src/models/ActivityLog.js";
import { nextAdmissionNumber, admissionYear } from "../src/lib/numbering.js";

const server = app();

beforeEach(resetState);

describe("GET /admin/users", () => {
  it("returns a bare array, which is what the users table consumes", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "instructor" });

    const res = await request(server).get("/admin/users").set(auth(admin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it("uses `status` rather than `is_active`, as the fixtures do", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "parent", is_active: false });

    const res = await request(server).get("/admin/users").set(auth(admin));

    const statuses = res.body.map((u) => u.status).sort();
    expect(statuses).toEqual(["active", "inactive"]);
    expect(res.body[0].is_active).toBeUndefined();
  });

  it("never exposes a password hash or token version", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/admin/users").set(auth(admin));

    for (const row of res.body) {
      expect(row.password_hash).toBeUndefined();
      expect(row.token_version).toBeUndefined();
    }
  });

  it("filters by role, by status and by search term", async () => {
    const admin = await makeUser({ role: "admin", name: "Zed Admin" });
    await makeUser({ role: "instructor", name: "Findable Teacher" });
    await makeUser({ role: "parent", is_active: false, name: "Gone Parent" });

    const byRole = await request(server)
      .get("/admin/users?role=instructor")
      .set(auth(admin));
    expect(byRole.body).toHaveLength(1);
    expect(byRole.body[0].role).toBe("instructor");

    const byStatus = await request(server)
      .get("/admin/users?status=inactive")
      .set(auth(admin));
    expect(byStatus.body).toHaveLength(1);
    expect(byStatus.body[0].status).toBe("inactive");

    const bySearch = await request(server)
      .get("/admin/users?q=Findable")
      .set(auth(admin));
    expect(bySearch.body).toHaveLength(1);
    expect(bySearch.body[0].name).toBe("Findable Teacher");
  });

  it("treats a search term as text, not as a regular expression", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "instructor", name: "Teacher" });

    // Unescaped, `.*` would match everything.
    const res = await request(server).get("/admin/users?q=.*").set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("includes age and programme track for students", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeFamily({ childOverrides: { age: 13, programme_track: "robotics" } });

    const res = await request(server)
      .get("/admin/users?role=student")
      .set(auth(admin));

    expect(res.body[0].age).toBe(13);
    expect(res.body[0].programme_track).toBe("Robotics");
  });
});

describe("POST /admin/users", () => {
  it("creates a user, forces a reset, and returns the one-time password once", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "instructor", name: "New Teacher", email: "new@kit.test" });

    expect(res.status).toBe(201);
    expect(res.body.must_reset_password).toBe(true);
    expect(res.body.password).toBeTruthy();

    // The password is returned, never stored in the clear.
    const stored = await User.findById(res.body.id).select("+password_hash");
    expect(stored.password_hash).not.toBe(res.body.password);
    expect(stored.password_hash).toMatch(/^\$2[aby]\$/);

    // And it is not in the list endpoint afterwards.
    const list = await request(server).get("/admin/users").set(auth(admin));
    for (const row of list.body) expect(row.password).toBeUndefined();
  });

  it("generates an admission number for a student and links the parent", async () => {
    const admin = await makeUser({ role: "admin" });
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({
        role: "student",
        name: "New Pupil",
        age: 10,
        programme_track: "Scratch Programming",
        parent_id: String(parent._id),
      });

    expect(res.status).toBe(201);
    expect(res.body.admission_no).toMatch(/^KIT\/\d{2}\/\d{3,4}$/);

    const student = await Student.findOne({ user_id: res.body.id });
    expect(String(student.parent_id)).toBe(String(parent._id));
    expect(student.programme_track).toBe("scratch");
  });

  it("refuses a student with no parent", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "student", name: "Orphan Record", age: 10, programme_track: "scratch" });

    expect(res.status).toBe(400);
    expect(res.body.fields.parent_id).toBeTruthy();
  });

  it("refuses a non-student with no email, who could never sign in", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "instructor", name: "No Contact" });

    expect(res.status).toBe(400);
    expect(res.body.fields.email).toBeTruthy();
  });

  it("refuses a duplicate email with 409", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "instructor", email: "taken@kit.test" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "instructor", name: "Clash", email: "taken@kit.test" });

    expect(res.status).toBe(409);
  });

  it("marks a student pending when the parent has never consented", async () => {
    const admin = await makeUser({ role: "admin" });
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({
        role: "student",
        name: "Unconsented",
        age: 9,
        programme_track: "scratch",
        parent_id: String(parent._id),
      });

    const student = await Student.findOne({ user_id: res.body.id });
    expect(student.status).toBe("pending");
  });

  it("marks a student active when the parent has already consented", async () => {
    const admin = await makeUser({ role: "admin" });
    const { parent } = await makeFamily({ consented: true });

    const res = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({
        role: "student",
        name: "Second Child",
        age: 12,
        programme_track: "robotics",
        parent_id: String(parent._id),
      });

    const student = await Student.findOne({ user_id: res.body.id });
    expect(student.status).toBe("active");
  });
});

describe("admission numbers", () => {
  it("issues unique numbers under 50 parallel creates", async () => {
    // The real risk: a read-then-write counter hands two simultaneous
    // requests the same number. nextAdmissionNumber is a single atomic
    // findOneAndUpdate with $inc, so it cannot.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => nextAdmissionNumber())
    );

    expect(new Set(results).size).toBe(50);

    const sequences = results
      .map((n) => Number(n.split("/")[2]))
      .sort((a, b) => a - b);
    // A contiguous run from 1 to 50: none skipped, none repeated.
    expect(sequences).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("issues unique numbers under 50 parallel HTTP creates", async () => {
    const admin = await makeUser({ role: "admin" });
    const parent = await makeUser({ role: "parent" });

    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        request(server)
          .post("/admin/users")
          .set(auth(admin))
          .send({
            role: "student",
            name: `Pupil ${i}`,
            age: 10,
            programme_track: "scratch",
            parent_id: String(parent._id),
          })
      )
    );

    const created = responses.filter((r) => r.status === 201);
    expect(created).toHaveLength(50);

    const numbers = created.map((r) => r.body.admission_no);
    expect(new Set(numbers).size).toBe(50);

    // The unique index agrees.
    const stored = await User.countDocuments({ role: "student" });
    expect(stored).toBe(50);
  }, 120000);

  it("pads to three digits and widens past 999", async () => {
    const { Counter } = await import("../src/models/Counter.js");
    const year = admissionYear();

    const first = await nextAdmissionNumber();
    expect(first).toBe(`KIT/${year}/001`);

    await Counter.updateOne(
      { _id: `admission:${year}` },
      { $set: { seq: 999 } },
      { upsert: true }
    );

    const fourDigit = await nextAdmissionNumber();
    expect(fourDigit).toBe(`KIT/${year}/1000`);
  });

  it("previews the next number without consuming it", async () => {
    const admin = await makeUser({ role: "admin" });

    const first = await request(server)
      .get("/admin/next-admission-no")
      .set(auth(admin));
    const second = await request(server)
      .get("/admin/next-admission-no")
      .set(auth(admin));

    expect(first.body.next).toBe(second.body.next);
    expect(first.body.next).toMatch(/^KIT\/\d{2}\/\d{3,4}$/);

    // Issuing one really does take that number.
    const issued = await nextAdmissionNumber();
    expect(issued).toBe(first.body.next);
  });
});

describe("activate and deactivate", () => {
  it("deactivates, revokes the session, then reactivates", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser({ role: "instructor" });

    const off = await request(server)
      .post("/admin/users/deactivate")
      .set(auth(admin))
      .send({ user_id: String(target._id) });
    expect(off.status).toBe(200);
    expect(off.body.success).toBe(true);

    const afterOff = await User.findById(target._id).select("+token_version");
    expect(afterOff.is_active).toBe(false);
    expect(afterOff.token_version).toBe(1);

    const on = await request(server)
      .post("/admin/users/activate")
      .set(auth(admin))
      .send({ user_id: String(target._id) });
    expect(on.status).toBe(200);

    const afterOn = await User.findById(target._id);
    expect(afterOn.is_active).toBe(true);
  });

  it("refuses to let an administrator deactivate themselves", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/users/deactivate")
      .set(auth(admin))
      .send({ user_id: String(admin._id) });

    expect(res.status).toBe(400);
    expect((await User.findById(admin._id)).is_active).toBe(true);
  });

  it("404s for an unknown user", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/users/deactivate")
      .set(auth(admin))
      .send({ user_id: missingId() });

    expect(res.status).toBe(404);
  });
});

describe("PUT /admin/users/:id", () => {
  it("updates a name", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser({ role: "instructor", name: "Before" });

    const res = await request(server)
      .put(`/admin/users/${target._id}`)
      .set(auth(admin))
      .send({ name: "After" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("After");
  });

  it("refuses a role change", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser({ role: "parent" });

    const res = await request(server)
      .put(`/admin/users/${target._id}`)
      .set(auth(admin))
      .send({ role: "admin" });

    expect(res.status).toBe(400);
    expect((await User.findById(target._id)).role).toBe("parent");
  });

  it("rejects a malformed id before touching the database", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .put("/admin/users/not-an-id")
      .set(auth(admin))
      .send({ name: "X" });

    expect(res.status).toBe(400);
    expect(res.body.fields.id).toBeTruthy();
  });
});

describe("audit log", () => {
  it("records every admin mutation", async () => {
    const admin = await makeUser({ role: "admin", name: "Auditor" });
    const target = await makeUser({ role: "instructor" });

    await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "instructor", name: "Made", email: "made@kit.test" });
    await request(server)
      .put(`/admin/users/${target._id}`)
      .set(auth(admin))
      .send({ name: "Renamed" });
    await request(server)
      .post("/admin/users/deactivate")
      .set(auth(admin))
      .send({ user_id: String(target._id) });
    await request(server)
      .post("/admin/users/activate")
      .set(auth(admin))
      .send({ user_id: String(target._id) });
    await request(server)
      .post("/admin/permissions")
      .set(auth(admin))
      .send({ permissions: { "analytics.view": ["admin"] } });

    const actions = (await ActivityLog.find({})).map((row) => row.action);

    expect(actions).toContain("created_user");
    expect(actions).toContain("updated_user");
    expect(actions).toContain("deactivated_user");
    expect(actions).toContain("activated_user");
    expect(actions).toContain("updated_permissions");
  });

  it("names the actor on each row", async () => {
    const admin = await makeUser({ role: "admin", name: "Named Admin" });

    await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "parent", name: "Pat Parent", email: "p@kit.test" });

    const row = await ActivityLog.findOne({ action: "created_user" });
    expect(row.actor_name).toBe("Named Admin");
    expect(row.actor_role).toBe("admin");
    expect(String(row.actor_id)).toBe(String(admin._id));
  });

  it("serves the log in the shape the admin screen reads", async () => {
    const admin = await makeUser({ role: "admin" });
    await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({ role: "parent", name: "Pat Parent", email: "p2@kit.test" });

    const res = await request(server).get("/admin/activity-log").set(auth(admin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("user_name");
    expect(res.body[0]).toHaveProperty("user_role");
    expect(res.body[0]).toHaveProperty("action");
    expect(res.body[0]).toHaveProperty("timestamp");
  });
});

describe("assign-instructor", () => {
  it("records the intent and accepts a valid instructor", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });

    const res = await request(server)
      .post("/admin/users/assign-instructor")
      .set(auth(admin))
      .send({ user_id: String(instructor._id), course_id: "c1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = await ActivityLog.findOne({ action: "assigned_instructor" });
    expect(row.meta.course_id).toBe("c1");
    expect(row.meta.pending_until_batch).toBe(2);
  });

  it("refuses someone who is not an instructor", async () => {
    const admin = await makeUser({ role: "admin" });
    const parent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/admin/users/assign-instructor")
      .set(auth(admin))
      .send({ user_id: String(parent._id) });

    expect(res.status).toBe(400);
  });

  it("refuses a deactivated instructor", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor", is_active: false });

    const res = await request(server)
      .post("/admin/users/assign-instructor")
      .set(auth(admin))
      .send({ user_id: String(instructor._id) });

    expect(res.status).toBe(400);
  });
});
