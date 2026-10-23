import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  can,
  applyOverrides,
  resetPermissions,
} from "../src/config/permissions.js";
import { ROLES } from "../src/config/constants.js";

const server = app();

/**
 * The permission matrix, tested two ways.
 *
 * `can()` is checked directly against PRD §10.1 so the matrix itself cannot
 * drift, and then every Batch 1 route is called as every role so the matrix
 * is actually *wired* — a correct table enforced nowhere protects nothing.
 */

describe("permission matrix (PRD §10.1)", () => {
  beforeEach(resetPermissions);

  // Transcribed from the PRD table rather than from the implementation, so
  // the two have to agree.
  const EXPECTED = {
    "users.manage": ["admin"],
    "course.create": ["admin"],
    "course.publish": ["admin"],
    "course.edit": ["admin", "instructor"],
    "content.read": ["admin", "instructor", "parent", "student"],
    "lesson.complete": ["student"],
    "quiz.submit": ["student"],
    "assignment.submit": ["student"],
    "submission.review": ["admin", "instructor"],
    "session.manage": ["admin", "instructor"],
    "attendance.mark": ["admin", "instructor"],
    "recording.add": ["admin", "instructor"],
    "session.view": ["admin", "instructor", "parent", "student"],
    "child.manage": ["parent"],
    "payment.make": ["parent"],
    "payment.view": ["admin", "parent"],
    "chat.use": ["admin", "instructor", "parent", "student"],
    "chat.monitor": ["admin"],
    "analytics.view": ["admin"],
    "settings.manage": ["admin"],
    "audit.view": ["admin"],
  };

  it("covers exactly the permissions the PRD lists", () => {
    expect(new Set(PERMISSION_KEYS)).toEqual(new Set(Object.keys(EXPECTED)));
  });

  // Every permission against every role: 21 x 4 = 84 assertions.
  for (const [key, allowed] of Object.entries(EXPECTED)) {
    for (const role of ROLES) {
      const should = allowed.includes(role);
      it(`${should ? "grants" : "denies"} ${key} to ${role}`, () => {
        expect(can(role, key)).toBe(should);
      });
    }
  }

  it("denies an unknown permission key, so a typo fails closed", () => {
    for (const role of ROLES) {
      expect(can(role, "nonsense.permission")).toBe(false);
    }
  });
});

describe("permission overrides", () => {
  beforeEach(resetPermissions);

  it("applies a valid override", () => {
    applyOverrides({ "analytics.view": ["admin", "instructor"] });

    expect(can("instructor", "analytics.view")).toBe(true);
    expect(can("parent", "analytics.view")).toBe(false);
  });

  it("ignores unknown keys and unknown roles rather than inventing permissions", () => {
    const { applied, ignored } = applyOverrides({
      "not.a.permission": ["admin"],
      "analytics.view": ["admin", "wizard"],
    });

    expect(ignored).toContain("not.a.permission");
    expect(applied).toContain("analytics.view");
    expect(can("admin", "analytics.view")).toBe(true);
    // "wizard" is not a role and must not have been stored.
    expect(can("wizard", "analytics.view")).toBe(false);
  });

  it("will not let an override lock every administrator out", () => {
    applyOverrides({ "users.manage": ["parent"] });

    // admin is re-added, because a saved typo must not make the platform
    // unadministrable.
    expect(can("admin", "users.manage")).toBe(true);
    expect(can("parent", "users.manage")).toBe(true);
  });

  it("restores the defaults on reset", () => {
    applyOverrides({ "analytics.view": ["admin", "parent"] });
    expect(can("parent", "analytics.view")).toBe(true);

    resetPermissions();
    expect(can("parent", "analytics.view")).toBe(false);
    expect(DEFAULT_PERMISSIONS["analytics.view"]).toEqual(["admin"]);
  });
});

/**
 * Every Batch 1 route, called as every role.
 *
 * `allow` lists the roles that must get through. Anything else must be
 * refused with 401 or 403 — never a 200, and never a 500.
 */
const ROUTE_MATRIX = [
  { method: "get", path: "/admin/users", allow: ["admin"] },
  { method: "post", path: "/admin/users", allow: ["admin"], body: { role: "instructor", name: "X Y", email: "new@kit.test" } },
  { method: "post", path: "/admin/users/activate", allow: ["admin"], usesTargetId: true },
  { method: "post", path: "/admin/users/deactivate", allow: ["admin"], usesTargetId: true },
  { method: "post", path: "/admin/users/assign-instructor", allow: ["admin"], usesInstructorId: true },
  { method: "get", path: "/admin/next-admission-no", allow: ["admin"] },
  { method: "get", path: "/admin/pending-enrollments", allow: ["admin"] },
  { method: "get", path: "/admin/activity-log", allow: ["admin"] },
  { method: "get", path: "/admin/stats", allow: ["admin"] },
  { method: "post", path: "/admin/permissions", allow: ["admin"], body: { permissions: {} } },
  { method: "get", path: "/parents/me", allow: ["parent"] },
  { method: "get", path: "/parents/me/children", allow: ["parent"] },
  { method: "get", path: "/students/me", allow: ["student"] },
  { method: "get", path: "/instructors/me", allow: ["instructor"] },
  { method: "get", path: "/instructors/me/courses", allow: ["instructor", "admin"] },
  { method: "get", path: "/instructors/me/students", allow: ["instructor", "admin"] },
  { method: "get", path: "/platform/settings", allow: ["admin", "instructor", "parent", "student"] },
  { method: "post", path: "/platform/settings", allow: ["admin"], body: { platform_name: "KIT" } },
  { method: "get", path: "/user/me", allow: ["admin", "instructor", "parent", "student"] },
  { method: "put", path: "/user/language", allow: ["admin", "instructor", "parent", "student"], body: { language_preference: "ha" } },
  { method: "get", path: "/notifications", allow: ["admin", "instructor", "parent", "student"] },
  // A parent adding a child: child.manage is parent-only.
  {
    method: "post",
    path: "/students",
    allow: ["parent"],
    body: {
      name: "New Child",
      age: 10,
      programme_track: "scratch",
      consent: { version: "1.0", accepted: true },
    },
  },
];

describe("every Batch 1 route against every role", () => {
  let users;
  let targetUser;
  let instructorTarget;

  // Per test, not once: the suite wipes every collection between tests, so
  // fixtures created in beforeAll would vanish after the first one and every
  // later request would 401 for a user that no longer exists. The password
  // hash is cached in helpers.js, so this is just a handful of inserts.
  beforeEach(async () => {
    resetPermissions();
    users = {
      admin: await makeUser({ role: "admin" }),
      instructor: await makeUser({ role: "instructor" }),
      parent: await makeUser({ role: "parent" }),
      student: (await makeFamily()).childUser,
    };
    targetUser = await makeUser({ role: "parent", name: "Target" });
    instructorTarget = await makeUser({ role: "instructor", name: "Target Instructor" });
  });

  for (const route of ROUTE_MATRIX) {
    for (const role of ROLES) {
      const allowed = route.allow.includes(role);

      it(`${allowed ? "allows" : "refuses"} ${role} to ${route.method.toUpperCase()} ${route.path}`, async () => {
        let body = route.body ?? {};
        if (route.usesTargetId) body = { user_id: String(targetUser._id) };
        if (route.usesInstructorId) body = { user_id: String(instructorTarget._id) };

        // Keep created users unique so repeats do not collide on email.
        if (route.path === "/admin/users" && route.method === "post") {
          body = { ...body, email: `new-${role}-${Date.now()}@kit.test` };
        }

        const res = await request(server)[route.method](route.path)
          .set(auth(users[role]))
          .send(body);

        if (allowed) {
          expect(res.status).toBeLessThan(400);
        } else {
          expect([401, 403]).toContain(res.status);
        }
      });
    }

    it(`refuses ${route.method.toUpperCase()} ${route.path} with no token`, async () => {
      const res = await request(server)[route.method](route.path).send(route.body ?? {});
      expect(res.status).toBe(401);
    });
  }
});

describe("ownership is checked as well as the matrix", () => {
  beforeEach(resetState);

  it("stops a parent reading another parent's child", async () => {
    const mine = await makeFamily();
    const theirs = await makeFamily();

    const ok = await request(server)
      .get(`/students/${mine.student._id}/progress`)
      .set(auth(mine.parent));
    expect(ok.status).toBe(200);

    const denied = await request(server)
      .get(`/students/${theirs.student._id}/progress`)
      .set(auth(mine.parent));
    expect(denied.status).toBe(403);
  });

  it("lets a student read their own progress but not another student's", async () => {
    const mine = await makeFamily();
    const theirs = await makeFamily();

    const ok = await request(server)
      .get(`/students/${mine.student._id}/progress`)
      .set(auth(mine.childUser));
    expect(ok.status).toBe(200);

    const denied = await request(server)
      .get(`/students/${theirs.student._id}/progress`)
      .set(auth(mine.childUser));
    expect(denied.status).toBe(403);
  });

  it("lets an admin read any student's progress", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();

    const res = await request(server)
      .get(`/students/${family.student._id}/progress`)
      .set(auth(admin));

    expect(res.status).toBe(200);
  });

  it("stops a parent reading another parent's children list", async () => {
    const mine = await makeFamily();
    await makeFamily();

    const res = await request(server).get("/parents/me/children").set(auth(mine.parent));

    expect(res.status).toBe(200);
    // Only their own child, never the other family's.
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(String(mine.student._id));
  });

  it("stops a non-admin reading someone else's notification feed", async () => {
    const parent = await makeUser({ role: "parent" });
    const other = await makeUser({ role: "parent" });

    const res = await request(server)
      .get(`/notifications?user_id=${other._id}`)
      .set(auth(parent));

    // The parameter is ignored for a non-admin; they get their own feed.
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
