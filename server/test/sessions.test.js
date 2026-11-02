import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Session } from "../src/models/Session.js";
import { Attendance } from "../src/models/Attendance.js";
import { Recording } from "../src/models/Recording.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Notification } from "../src/models/Notification.js";
import {
  computeSessionStatus,
  isAttendanceOpen,
  attendanceWindow,
} from "../src/lib/sessionStatus.js";
import {
  runReminderPass,
  sendSessionReminders,
} from "../src/jobs/reminders.js";

const server = app();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(resetState);

async function makeCourseWithSession({
  offsetMs = -5 * MINUTE,
  duration = 60,
  cancelled = false,
  mode = "online",
} = {}) {
  const instructor = await makeUser({ role: "instructor" });

  const course = await Course.create({
    title: "Session Course",
    programme_track: "scratch",
    instructor_id: instructor._id,
    status: "published",
  });

  const session = await Session.create({
    title: "Week 3",
    description: "A class",
    course_id: course._id,
    instructor_id: instructor._id,
    scheduled_at: new Date(Date.now() + offsetMs),
    duration_minutes: duration,
    mode,
    meeting_url: mode === "physical" ? null : "https://meet.example.com/abc",
    venue: mode === "online" ? null : "Birnin Kebbi",
    status: cancelled ? "cancelled" : "scheduled",
    cancel_reason: cancelled ? "Kit not arrived" : null,
  });

  return { instructor, course, session };
}

async function enrolledStudent(course) {
  const family = await makeFamily();
  await Enrollment.create({
    student_id: family.student._id,
    course_id: course._id,
    status: "active",
    source: "admin",
  });
  return family;
}

// ── Status ──────────────────────────────────────────────────────────────────

describe("session status is computed, not stored", () => {
  const base = { scheduled_at: new Date("2026-06-01T10:00:00Z"), duration_minutes: 60 };

  it("is scheduled before it starts", () => {
    expect(
      computeSessionStatus(base, new Date("2026-06-01T09:59:00Z"))
    ).toBe("scheduled");
  });

  it("is live between start and end, inclusive of both edges", () => {
    expect(computeSessionStatus(base, new Date("2026-06-01T10:00:00Z"))).toBe("live");
    expect(computeSessionStatus(base, new Date("2026-06-01T10:30:00Z"))).toBe("live");
    expect(computeSessionStatus(base, new Date("2026-06-01T11:00:00Z"))).toBe("live");
  });

  it("is completed one moment after it ends", () => {
    expect(
      computeSessionStatus(base, new Date("2026-06-01T11:00:01Z"))
    ).toBe("completed");
  });

  it("stays cancelled whatever the clock says", () => {
    const cancelled = { ...base, status: "cancelled" };
    expect(computeSessionStatus(cancelled, new Date("2026-06-01T10:30:00Z"))).toBe(
      "cancelled"
    );
    expect(computeSessionStatus(cancelled, new Date("2026-07-01T00:00:00Z"))).toBe(
      "cancelled"
    );
  });

  it("reports the computed status over HTTP", async () => {
    const { course, session } = await makeCourseWithSession({ offsetMs: -5 * MINUTE });
    const { childUser } = await enrolledStudent(course);

    const res = await request(server)
      .get(`/sessions/${session._id}`)
      .set(auth(childUser));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("live");
    // The stored value is still the honest one.
    expect((await Session.findById(session._id)).status).toBe("scheduled");
  });
});

// ── Visibility ──────────────────────────────────────────────────────────────

describe("session visibility", () => {
  it("shows a student only their enrolled courses' sessions", async () => {
    const mine = await makeCourseWithSession();
    const theirs = await makeCourseWithSession();
    const { childUser } = await enrolledStudent(mine.course);

    const res = await request(server).get("/sessions").set(auth(childUser));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(String(mine.session._id));
    expect(res.body.map((s) => s.id)).not.toContain(String(theirs.session._id));
  });

  it("shows a parent their children's sessions and no one else's", async () => {
    const mine = await makeCourseWithSession();
    const theirs = await makeCourseWithSession();
    const family = await enrolledStudent(mine.course);
    await enrolledStudent(theirs.course);

    const res = await request(server).get("/sessions").set(auth(family.parent));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(String(mine.session._id));
  });

  it("shows an instructor their own sessions", async () => {
    const mine = await makeCourseWithSession();
    await makeCourseWithSession();

    const res = await request(server)
      .get("/sessions")
      .set(auth(mine.instructor));

    expect(res.body).toHaveLength(1);
  });

  it("shows an admin everything", async () => {
    await makeCourseWithSession();
    await makeCourseWithSession();
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/sessions").set(auth(admin));

    expect(res.body).toHaveLength(2);
  });

  it("refuses a session on a course the student is not on", async () => {
    const theirs = await makeCourseWithSession();
    const { childUser } = await makeFamily();

    const res = await request(server)
      .get(`/sessions/${theirs.session._id}`)
      .set(auth(childUser));

    expect(res.status).toBe(403);
  });

  it("filters by live, upcoming and completed", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeCourseWithSession({ offsetMs: -5 * MINUTE });
    await makeCourseWithSession({ offsetMs: DAY });
    await makeCourseWithSession({ offsetMs: -3 * DAY });

    const live = await request(server).get("/sessions?filter=live").set(auth(admin));
    const upcoming = await request(server)
      .get("/sessions?filter=upcoming")
      .set(auth(admin));
    const completed = await request(server)
      .get("/sessions?filter=completed")
      .set(auth(admin));

    expect(live.body).toHaveLength(1);
    expect(upcoming.body).toHaveLength(1);
    expect(completed.body).toHaveLength(1);
  });
});

// ── Managing sessions ───────────────────────────────────────────────────────

describe("creating and changing sessions", () => {
  it("refuses an online session with no meeting link", async () => {
    const { instructor, course } = await makeCourseWithSession();

    const res = await request(server)
      .post("/sessions")
      .set(auth(instructor))
      .send({
        title: "No link",
        course_id: String(course._id),
        scheduled_at: new Date(Date.now() + DAY).toISOString(),
        mode: "online",
      });

    expect(res.status).toBe(400);
    expect(res.body.fields.meeting_url).toBeTruthy();
  });

  it("refuses a physical session with no venue", async () => {
    const { instructor, course } = await makeCourseWithSession();

    const res = await request(server)
      .post("/sessions")
      .set(auth(instructor))
      .send({
        title: "No venue",
        course_id: String(course._id),
        scheduled_at: new Date(Date.now() + DAY).toISOString(),
        mode: "physical",
      });

    expect(res.status).toBe(400);
    expect(res.body.fields.venue).toBeTruthy();
  });

  it("stops an instructor scheduling on someone else's course", async () => {
    const { course } = await makeCourseWithSession();
    const stranger = await makeUser({ role: "instructor" });

    const res = await request(server)
      .post("/sessions")
      .set(auth(stranger))
      .send({
        title: "Not mine",
        course_id: String(course._id),
        scheduled_at: new Date(Date.now() + DAY).toISOString(),
        mode: "online",
        meeting_url: "https://meet.example.com/x",
      });

    expect(res.status).toBe(403);
  });

  it("stops an instructor cancelling someone else's session", async () => {
    const { session } = await makeCourseWithSession();
    const stranger = await makeUser({ role: "instructor" });

    const res = await request(server)
      .post(`/sessions/${session._id}/cancel`)
      .set(auth(stranger))
      .send({ reason: "Because" });

    expect(res.status).toBe(403);
  });

  it("notifies enrolled students and their parents on cancellation", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: DAY,
    });
    const family = await enrolledStudent(course);

    const res = await request(server)
      .post(`/sessions/${session._id}/cancel`)
      .set(auth(instructor))
      .send({ reason: "Instructor unwell" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.cancel_reason).toBe("Instructor unwell");

    const notified = await Notification.find({ type: "session_cancelled" });
    const recipients = notified.map((n) => String(n.user_id)).sort();
    expect(recipients).toEqual(
      [String(family.childUser._id), String(family.parent._id)].sort()
    );
  });

  it("rescheduling revives a cancelled session and resets its reminders", async () => {
    const { instructor, session } = await makeCourseWithSession({
      offsetMs: DAY,
      cancelled: true,
    });
    await Session.updateOne(
      { _id: session._id },
      { $set: { reminders_sent: ["24h"] } }
    );

    const when = new Date(Date.now() + 3 * DAY).toISOString();
    const res = await request(server)
      .post(`/sessions/${session._id}/reschedule`)
      .set(auth(instructor))
      .send({ scheduled_at: when });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");

    const stored = await Session.findById(session._id);
    expect(stored.cancel_reason).toBeNull();
    expect(stored.rescheduled_from).not.toBeNull();
    // A moved class has to chase its reminders again.
    expect(stored.reminders_sent).toEqual([]);
  });
});

// ── Attendance ──────────────────────────────────────────────────────────────

describe("the attendance window", () => {
  it("opens 15 minutes before and closes 24 hours after the end", () => {
    const session = {
      scheduled_at: new Date("2026-06-01T10:00:00Z"),
      duration_minutes: 60,
    };
    const { opens, closes } = attendanceWindow(session);

    expect(opens.toISOString()).toBe("2026-06-01T09:45:00.000Z");
    expect(closes.toISOString()).toBe("2026-06-02T11:00:00.000Z");

    expect(isAttendanceOpen(session, new Date("2026-06-01T09:44:00Z"))).toBe(false);
    expect(isAttendanceOpen(session, new Date("2026-06-01T09:46:00Z"))).toBe(true);
    expect(isAttendanceOpen(session, new Date("2026-06-02T10:59:00Z"))).toBe(true);
    expect(isAttendanceOpen(session, new Date("2026-06-02T11:01:00Z"))).toBe(false);
  });

  it("is closed for a cancelled session", () => {
    const session = {
      scheduled_at: new Date(),
      duration_minutes: 60,
      status: "cancelled",
    };
    expect(isAttendanceOpen(session)).toBe(false);
  });

  it("refuses a register saved long after the class", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: -10 * DAY,
    });
    const family = await enrolledStudent(course);

    const res = await request(server)
      .put(`/sessions/${session._id}/attendance`)
      .set(auth(instructor))
      .send({
        records: [{ student_id: String(family.student._id), status: "present" }],
      });

    expect(res.status).toBe(403);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  it("saves a register inside the window and reports the roster", async () => {
    const { instructor, course, session } = await makeCourseWithSession();
    const a = await enrolledStudent(course);
    const b = await enrolledStudent(course);

    const save = await request(server)
      .put(`/sessions/${session._id}/attendance`)
      .set(auth(instructor))
      .send({
        records: [
          { student_id: String(a.student._id), status: "present" },
          { student_id: String(b.student._id), status: "absent" },
        ],
      });

    expect(save.status).toBe(200);
    expect(save.body.saved).toBe(2);

    const roster = await request(server)
      .get(`/sessions/${session._id}/roster`)
      .set(auth(instructor));

    expect(roster.status).toBe(200);
    expect(roster.body.attendance_open).toBe(true);
    expect(roster.body.students).toHaveLength(2);
    // Keyed by id, not name: the fixtures share a name.
    const marks = Object.fromEntries(
      roster.body.students.map((s) => [s.student_id, s.status])
    );
    expect(marks[String(a.student._id)]).toBe("present");
    expect(marks[String(b.student._id)]).toBe("absent");
  });

  it("refuses a mark for someone not enrolled", async () => {
    const { instructor, course, session } = await makeCourseWithSession();
    await enrolledStudent(course);
    const outsider = await makeFamily();

    const res = await request(server)
      .put(`/sessions/${session._id}/attendance`)
      .set(auth(instructor))
      .send({
        records: [
          { student_id: String(outsider.student._id), status: "present" },
        ],
      });

    // Silently skipping would hide a real mistake.
    expect(res.status).toBe(400);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  it("saving twice updates rather than duplicating", async () => {
    const { instructor, course, session } = await makeCourseWithSession();
    const family = await enrolledStudent(course);

    const body = (status) => ({
      records: [{ student_id: String(family.student._id), status }],
    });

    await request(server)
      .put(`/sessions/${session._id}/attendance`)
      .set(auth(instructor))
      .send(body("absent"));
    await request(server)
      .put(`/sessions/${session._id}/attendance`)
      .set(auth(instructor))
      .send(body("present"));

    expect(await Attendance.countDocuments({})).toBe(1);
    expect((await Attendance.findOne({})).status).toBe("present");
  });
});

// ── QR check-in ─────────────────────────────────────────────────────────────

describe("QR check-in", () => {
  it("marks a student present with a fresh token", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: -2 * MINUTE,
    });
    const family = await enrolledStudent(course);

    const token = await request(server)
      .post(`/sessions/${session._id}/qr-token`)
      .set(auth(instructor));
    expect(token.status).toBe(200);
    expect(token.body.expires_in).toBe(60);

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: token.body.token, method: "qr" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("present");
    expect(res.body.method).toBe("qr");

    const mark = await Attendance.findOne({});
    expect(mark.method).toBe("qr");
  });

  it("records `late` for someone arriving more than ten minutes in", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: -20 * MINUTE,
    });
    const family = await enrolledStudent(course);

    const token = await request(server)
      .post(`/sessions/${session._id}/qr-token`)
      .set(auth(instructor));

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: token.body.token });

    // Recorded, not punished.
    expect(res.body.status).toBe("late");
  });

  it("refuses an expired token", async () => {
    const { course, session } = await makeCourseWithSession();
    const family = await enrolledStudent(course);

    const expired = jwt.sign(
      { sid: String(session._id), purpose: "attendance" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-10s" }
    );

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: expired });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(await Attendance.countDocuments({})).toBe(0);
  });

  it("refuses a token minted for a different session", async () => {
    const one = await makeCourseWithSession();
    const two = await makeCourseWithSession();
    const family = await enrolledStudent(one.course);
    await Enrollment.create({
      student_id: family.student._id,
      course_id: two.course._id,
      status: "active",
    });

    const token = await request(server)
      .post(`/sessions/${two.session._id}/qr-token`)
      .set(auth(two.instructor));

    // The obvious way to try to be in two classes at once.
    const res = await request(server)
      .post(`/sessions/${one.session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: token.body.token });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different session/i);
  });

  it("refuses an access token presented as a check-in code", async () => {
    const { course, session } = await makeCourseWithSession();
    const family = await enrolledStudent(course);

    // A valid JWT, but not an attendance one.
    const { signAccessToken } = await import("../src/lib/tokens.js");
    const access = signAccessToken({
      id: family.childUser._id,
      role: "student",
      token_version: 0,
    });

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: access });

    expect(res.status).toBe(400);
  });

  it("refuses a student who is not enrolled", async () => {
    const { instructor, session } = await makeCourseWithSession();
    const outsider = await makeFamily();

    const token = await request(server)
      .post(`/sessions/${session._id}/qr-token`)
      .set(auth(instructor));

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(outsider.childUser))
      .send({ token: token.body.token });

    expect(res.status).toBe(403);
  });

  it("refuses a check-in when the class is not running", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: DAY,
    });
    const family = await enrolledStudent(course);

    const token = await request(server)
      .post(`/sessions/${session._id}/qr-token`)
      .set(auth(instructor));

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ token: token.body.token });

    expect(res.status).toBe(400);
  });

  it("accepts an automatic check-in when joining online, with no token", async () => {
    const { course, session } = await makeCourseWithSession();
    const family = await enrolledStudent(course);

    const res = await request(server)
      .post(`/sessions/${session._id}/check-in`)
      .set(auth(family.childUser))
      .send({ method: "auto" });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe("auto");
    expect((await Attendance.findOne({})).method).toBe("auto");
  });

  it("will not let a parent or instructor check in as a pupil", async () => {
    const { instructor, course, session } = await makeCourseWithSession();
    const family = await enrolledStudent(course);

    for (const user of [family.parent, instructor]) {
      const res = await request(server)
        .post(`/sessions/${session._id}/check-in`)
        .set(auth(user))
        .send({ method: "auto" });
      expect(res.status).toBe(403);
    }
  });
});

// ── Recordings ──────────────────────────────────────────────────────────────

describe("recordings", () => {
  it("is added by the instructor and visible to enrolled students", async () => {
    const { instructor, course, session } = await makeCourseWithSession({
      offsetMs: -3 * DAY,
    });
    const family = await enrolledStudent(course);

    const add = await request(server)
      .post(`/sessions/${session._id}/recordings`)
      .set(auth(instructor))
      .send({ url: "https://youtube.com/watch?v=abc", source: "youtube" });

    expect(add.status).toBe(201);
    expect(await Recording.countDocuments({})).toBe(1);

    const list = await request(server)
      .get("/recordings")
      .set(auth(family.childUser));

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].session_title).toBe("Week 3");

    // And it appears on the session itself.
    const detail = await request(server)
      .get(`/sessions/${session._id}`)
      .set(auth(family.childUser));
    expect(detail.body.recording_url).toContain("youtube.com");
  });

  it("is hidden from a student on another course", async () => {
    const { instructor, session } = await makeCourseWithSession({
      offsetMs: -3 * DAY,
    });
    const outsider = await makeFamily();

    await request(server)
      .post(`/sessions/${session._id}/recordings`)
      .set(auth(instructor))
      .send({ url: "https://youtube.com/watch?v=abc" });

    const list = await request(server)
      .get("/recordings")
      .set(auth(outsider.childUser));

    expect(list.body).toHaveLength(0);
  });

  it("refuses an instructor adding one to someone else's session", async () => {
    const { session } = await makeCourseWithSession();
    const stranger = await makeUser({ role: "instructor" });

    const res = await request(server)
      .post(`/sessions/${session._id}/recordings`)
      .set(auth(stranger))
      .send({ url: "https://youtube.com/watch?v=abc" });

    expect(res.status).toBe(403);
  });
});

// ── Admin reporting ─────────────────────────────────────────────────────────

describe("the admin attendance report", () => {
  it("counts only sessions that have actually happened", async () => {
    const admin = await makeUser({ role: "admin" });

    // One finished, one still to come.
    const past = await makeCourseWithSession({ offsetMs: -3 * DAY });
    const family = await enrolledStudent(past.course);
    await Session.create({
      title: "Future",
      course_id: past.course._id,
      instructor_id: past.instructor._id,
      scheduled_at: new Date(Date.now() + DAY),
      duration_minutes: 60,
      mode: "online",
      meeting_url: "https://meet.example.com/x",
    });

    await Attendance.create({
      session_id: past.session._id,
      student_id: family.student._id,
      status: "present",
      method: "roster",
    });

    const res = await request(server)
      .get("/admin/sessions/attendance-report")
      .set(auth(admin));

    expect(res.status).toBe(200);
    // Next week's class is not an absence.
    expect(res.body.sessions_held).toBe(1);
    expect(res.body.overall_rate).toBe(100);
    expect(res.body.students[0].by_method).toEqual({ roster: 1 });
  });

  it("counts a late arrival as present", async () => {
    const admin = await makeUser({ role: "admin" });
    const { course, session } = await makeCourseWithSession({ offsetMs: -3 * DAY });
    const family = await enrolledStudent(course);

    await Attendance.create({
      session_id: session._id,
      student_id: family.student._id,
      status: "late",
      method: "qr",
    });

    const res = await request(server)
      .get("/admin/sessions/attendance-report")
      .set(auth(admin));

    expect(res.body.students[0].rate).toBe(100);
  });

  it("gives the overview the right counts", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeCourseWithSession({ offsetMs: -5 * MINUTE });
    await makeCourseWithSession({ offsetMs: DAY });
    await makeCourseWithSession({ offsetMs: -3 * DAY });
    await makeCourseWithSession({ offsetMs: DAY, cancelled: true });

    const res = await request(server)
      .get("/admin/sessions/overview")
      .set(auth(admin));

    expect(res.body.total_sessions).toBe(4);
    expect(res.body.live_now).toBe(1);
    expect(res.body.upcoming).toBe(1);
    expect(res.body.completed).toBe(1);
    expect(res.body.cancelled).toBe(1);
  });
});

// ── Reminders ───────────────────────────────────────────────────────────────

describe("the reminder job", () => {
  it("sends a 24-hour reminder once, however often it runs", async () => {
    const { course, session } = await makeCourseWithSession({ offsetMs: DAY });
    const family = await enrolledStudent(course);

    const first = await sendSessionReminders();
    expect(first).toBe(2); // the pupil and their parent

    // Running again changes nothing: reminders_sent is the guard.
    const second = await sendSessionReminders();
    expect(second).toBe(0);

    const notices = await Notification.find({ type: "session_reminder" });
    expect(notices).toHaveLength(2);
    expect(
      (await Session.findById(session._id)).reminders_sent
    ).toContain("24h");

    const recipients = notices.map((n) => String(n.user_id)).sort();
    expect(recipients).toEqual(
      [String(family.childUser._id), String(family.parent._id)].sort()
    );
  });

  it("sends a 15-minute reminder as the class approaches", async () => {
    const { course, session } = await makeCourseWithSession({
      offsetMs: 15 * MINUTE,
    });
    await enrolledStudent(course);

    await sendSessionReminders();

    expect((await Session.findById(session._id)).reminders_sent).toContain("15m");
  });

  it("ignores a cancelled session", async () => {
    const { course } = await makeCourseWithSession({
      offsetMs: DAY,
      cancelled: true,
    });
    await enrolledStudent(course);

    const sent = await sendSessionReminders();

    expect(sent).toBe(0);
    expect(await Notification.countDocuments({ type: "session_reminder" })).toBe(0);
  });

  it("does not send for a class that is neither due soon nor tomorrow", async () => {
    const { course } = await makeCourseWithSession({ offsetMs: 5 * DAY });
    await enrolledStudent(course);

    expect(await sendSessionReminders()).toBe(0);
  });

  it("runs a whole pass without throwing on an empty database", async () => {
    const result = await runReminderPass();
    expect(result).toEqual({ sessions: 0, overdue: 0 });
  });

  it("gives the claim back if sending fails, so the next tick retries", async () => {
    const { course, session } = await makeCourseWithSession({ offsetMs: DAY });
    await enrolledStudent(course);

    const spy = vi
      .spyOn(Notification, "insertMany")
      .mockRejectedValueOnce(new Error("database away"));

    const sent = await sendSessionReminders();
    expect(sent).toBe(0);
    // Not marked, so it will be tried again rather than lost.
    expect((await Session.findById(session._id)).reminders_sent).toEqual([]);

    spy.mockRestore();

    const retry = await sendSessionReminders();
    expect(retry).toBe(2);
  });
});
