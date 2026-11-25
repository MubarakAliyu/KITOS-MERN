import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Payment } from "../src/models/Payment.js";
import { Subscription } from "../src/models/Subscription.js";
import { QuizAttempt } from "../src/models/QuizAttempt.js";
import { Session } from "../src/models/Session.js";
import { Attendance } from "../src/models/Attendance.js";
import { ActivityLog } from "../src/models/ActivityLog.js";

let server;

beforeEach(async () => {
  await resetState();
  server = app();
});

const DAY = 24 * 60 * 60 * 1000;

/** Writes `created_at` for real: the schema marks timestamps immutable. */
async function backdate(Model, id, when) {
  await Model.collection.updateOne({ _id: id }, { $set: { created_at: when } });
}

/** The first of the month, `monthsAgo` back, mid-month to avoid boundaries. */
function monthsBack(monthsAgo) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 14);
  date.setHours(10, 0, 0, 0);
  return date;
}

async function makeCourse(overrides = {}) {
  const instructorId =
    overrides.instructor_id ?? (await makeUser({ role: "instructor" }))._id;

  return Course.create({
    title: "Scratch Programming",
    programme_track: "scratch",
    status: "published",
    price_kobo: 1_500_000,
    ...overrides,
    instructor_id: instructorId,
  });
}

async function paidPayment({ course, parent, student, type, monthsAgo, amountKobo }) {
  const payment = await Payment.create({
    tx_ref: `KIT-TEST-${Math.random().toString(36).slice(2, 12)}`,
    parent_id: parent._id,
    student_id: student._id,
    course_id: course._id,
    amount_kobo: amountKobo ?? course.price_kobo,
    type,
    status: "paid",
    paid_at: monthsBack(monthsAgo),
    receipt_no: `RCP-TEST-${Math.random().toString(36).slice(2, 8)}`,
  });
  await backdate(Payment, payment._id, monthsBack(monthsAgo));
  return payment;
}

// ── The dashboard tiles ─────────────────────────────────────────────────────

describe("GET /admin/stats", () => {
  it("reports real counts and revenue, not the Batch 1 zeros", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();
    await makeUser({ role: "instructor" });
    const course = await makeCourse();

    await paidPayment({
      course,
      parent: family.parent,
      student: family.student,
      type: "subscription",
      monthsAgo: 0,
    });
    await Subscription.create({
      parent_id: family.parent._id,
      student_id: family.student._id,
      course_id: course._id,
      amount_kobo: 1_500_000,
      status: "active",
    });

    const res = await request(server).get("/admin/stats").set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.total_students).toBe(1);
    expect(res.body.total_courses).toBe(1);
    expect(res.body.total_revenue).toBe(15000);
    expect(res.body.active_subscriptions).toBe(1);
  });

  it("counts only paid revenue", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();
    const course = await makeCourse();

    await paidPayment({
      course,
      parent: family.parent,
      student: family.student,
      type: "one_time",
      monthsAgo: 0,
    });
    await Payment.create({
      tx_ref: "KIT-PENDING-1",
      parent_id: family.parent._id,
      student_id: family.student._id,
      course_id: course._id,
      amount_kobo: 2_500_000,
      type: "one_time",
      status: "pending",
    });

    const res = await request(server).get("/admin/stats").set(auth(admin));

    expect(res.body.total_revenue).toBe(15000);
  });

  /**
   * Growth from nothing is not "infinite per cent". The tile shows the count
   * itself, which is what the arrow beside a small number should convey.
   */
  it("does not divide by zero when last month was empty", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();
    const course = await makeCourse();

    await paidPayment({
      course,
      parent: family.parent,
      student: family.student,
      type: "one_time",
      monthsAgo: 0,
    });

    const res = await request(server).get("/admin/stats").set(auth(admin));

    expect(Number.isFinite(res.body.revenue_change)).toBe(true);
    expect(res.body.revenue_change).toBe(15000);
  });

  it("is refused to everyone but an admin", async () => {
    const instructor = await makeUser({ role: "instructor" });

    const res = await request(server).get("/admin/stats").set(auth(instructor));

    expect(res.status).toBe(403);
  });
});

// ── The analytics charts ────────────────────────────────────────────────────

describe("GET /admin/analytics", () => {
  it("returns all five series the charts bind to", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/admin/analytics").set(auth(admin));

    expect(res.status).toBe(200);
    for (const key of [
      "enrollment_trend",
      "revenue_monthly",
      "course_completion",
      "quiz_performance",
      "payment_split",
    ]) {
      expect(Array.isArray(res.body[key]), key).toBe(true);
    }
    // Six buckets even with no data: a missing month is a broken chart, not
    // an empty one.
    expect(res.body.enrollment_trend).toHaveLength(6);
    expect(res.body.revenue_monthly).toHaveLength(6);
    expect(res.body.enrollment_trend[0]).toHaveProperty("month");
    expect(res.body.enrollment_trend[0]).toHaveProperty("students");
  });

  /**
   * Cumulative, so the line only ever climbs. Per-month arrivals would show
   * a dip for a quiet month and read as pupils leaving.
   */
  it("reports the enrolment trend cumulatively", async () => {
    const admin = await makeUser({ role: "admin" });
    const course = await makeCourse();

    const older = await makeFamily();
    const newer = await makeFamily({ childOverrides: { name: "Newer Child" } });

    const first = await Enrollment.create({
      student_id: older.student._id,
      course_id: course._id,
      status: "active",
    });
    await backdate(Enrollment, first._id, monthsBack(3));

    const second = await Enrollment.create({
      student_id: newer.student._id,
      course_id: course._id,
      status: "active",
    });
    await backdate(Enrollment, second._id, monthsBack(1));

    const res = await request(server).get("/admin/analytics").set(auth(admin));
    const trend = res.body.enrollment_trend.map((row) => row.students);

    expect(trend.at(-1)).toBe(2);
    // Never decreasing.
    for (let i = 1; i < trend.length; i += 1) {
      expect(trend[i]).toBeGreaterThanOrEqual(trend[i - 1]);
    }
  });

  it("splits revenue by month and by type", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();
    const course = await makeCourse();

    await paidPayment({
      course,
      parent: family.parent,
      student: family.student,
      type: "subscription",
      monthsAgo: 2,
    });
    await paidPayment({
      course,
      parent: family.parent,
      student: family.student,
      type: "one_time",
      monthsAgo: 0,
      amountKobo: 2_000_000,
    });

    const res = await request(server).get("/admin/analytics").set(auth(admin));

    expect(res.body.revenue_monthly.at(-3).subscription).toBe(15000);
    expect(res.body.revenue_monthly.at(-1).one_time).toBe(20000);

    const split = res.body.payment_split;
    expect(split.find((s) => s.name === "Subscription").value).toBe(15000);
    expect(split.find((s) => s.name === "One-time").value).toBe(20000);
    // The donut colours its own slices.
    expect(split[0].fill).toBe("#10B981");
  });

  it("reports a completion rate per course, shortened for the axis", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const course = await Course.create({
      title: "Web Development",
      programme_track: "web-development",
      instructor_id: instructor._id,
      status: "published",
    });

    const done = await makeFamily();
    const midway = await makeFamily({ childOverrides: { name: "Midway Child" } });
    await Enrollment.create({
      student_id: done.student._id,
      course_id: course._id,
      status: "completed",
    });
    await Enrollment.create({
      student_id: midway.student._id,
      course_id: course._id,
      status: "active",
    });

    const res = await request(server).get("/admin/analytics").set(auth(admin));
    const row = res.body.course_completion[0];

    expect(row.rate).toBe(50);
    // "Web Development" does not fit the 80px axis; the fixture shortened it
    // by hand and so does this.
    expect(row.course.length).toBeLessThanOrEqual(12);
    expect(row.course).toMatch(/^Web/);
  });

  it("gives a course nobody is on a rate of zero rather than leaving it out", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeCourse({ title: "Empty Course" });

    const res = await request(server).get("/admin/analytics").set(auth(admin));

    expect(res.body.course_completion).toHaveLength(1);
    expect(res.body.course_completion[0].rate).toBe(0);
  });

  /**
   * A month nobody sat a quiz in is left out, not plotted as zero: an average
   * of zero would read as a cohort that failed everything.
   */
  it("plots only the months with quiz attempts", async () => {
    const admin = await makeUser({ role: "admin" });
    const family = await makeFamily();
    const course = await makeCourse();

    // A distinct quiz per attempt: there is a unique index on
    // (quiz_id, student_id), because one pupil has one attempt record per
    // quiz and a retake updates it.
    const quizIds = [
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
    ];

    for (const [index, [monthsAgo, percentage]] of [
      [2, 60],
      [2, 80],
      [0, 90],
    ].entries()) {
      const attempt = await QuizAttempt.create({
        quiz_id: quizIds[index],
        student_id: family.student._id,
        course_id: course._id,
        score: 1,
        total: 1,
        percentage,
        attempts: 1,
      });
      await backdate(QuizAttempt, attempt._id, monthsBack(monthsAgo));
    }

    const res = await request(server).get("/admin/analytics").set(auth(admin));

    expect(res.body.quiz_performance).toHaveLength(2);
    expect(res.body.quiz_performance[0].average).toBe(70);
    expect(res.body.quiz_performance[1].average).toBe(90);
  });

  /**
   * The same rule the session report uses: a class still to come would drag
   * the rate down for no reason.
   */
  it("computes the attendance rate over classes actually held", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const course = await makeCourse({ instructor_id: instructor._id });
    const family = await makeFamily();

    await Enrollment.create({
      student_id: family.student._id,
      course_id: course._id,
      status: "active",
    });

    const held = await Session.create({
      title: "Last week",
      course_id: course._id,
      instructor_id: instructor._id,
      scheduled_at: new Date(Date.now() - 7 * DAY),
      duration_minutes: 60,
    });
    await Session.create({
      title: "Next week",
      course_id: course._id,
      instructor_id: instructor._id,
      scheduled_at: new Date(Date.now() + 7 * DAY),
      duration_minutes: 60,
    });

    await Attendance.create({
      session_id: held._id,
      student_id: family.student._id,
      status: "present",
      method: "roster",
    });

    const res = await request(server).get("/admin/analytics").set(auth(admin));

    expect(res.body.sessions_held).toBe(1);
    expect(res.body.attendance_rate).toBe(100);
  });

  it("is refused to everyone but an admin", async () => {
    const parent = await makeUser({ role: "parent" });

    const res = await request(server).get("/admin/analytics").set(auth(parent));

    expect(res.status).toBe(403);
  });
});

// ── The activity log ────────────────────────────────────────────────────────

describe("GET /admin/activity-log", () => {
  async function seedLog() {
    const rows = [
      { action: "created_user", actor_role: "admin", target_type: "user" },
      { action: "payment_confirmed", actor_role: "system", target_type: "payment" },
      { action: "published_course", actor_role: "admin", target_type: "course" },
    ];
    for (const row of rows) {
      await ActivityLog.create({
        actor_name: "Tester",
        description: row.action,
        ...row,
      });
    }
  }

  it("returns the log newest first", async () => {
    const admin = await makeUser({ role: "admin" });
    await seedLog();

    const res = await request(server)
      .get("/admin/activity-log")
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    const times = res.body.map((r) => new Date(r.created_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("filters by action and by actor role", async () => {
    const admin = await makeUser({ role: "admin" });
    await seedLog();

    const byAction = await request(server)
      .get("/admin/activity-log?action=payment_confirmed")
      .set(auth(admin));
    expect(byAction.body).toHaveLength(1);
    expect(byAction.body[0].action).toBe("payment_confirmed");

    const byRole = await request(server)
      .get("/admin/activity-log?actor_role=system")
      .set(auth(admin));
    expect(byRole.body).toHaveLength(1);
  });

  it("paginates", async () => {
    const admin = await makeUser({ role: "admin" });
    await seedLog();

    const firstPage = await request(server)
      .get("/admin/activity-log?page=1&limit=2")
      .set(auth(admin));
    expect(firstPage.body).toHaveLength(2);

    const secondPage = await request(server)
      .get("/admin/activity-log?page=2&limit=2")
      .set(auth(admin));
    expect(secondPage.body.length).toBeGreaterThanOrEqual(1);
    expect(secondPage.body[0].id).not.toBe(firstPage.body[0].id);
  });

  it("is refused without audit.view", async () => {
    const instructor = await makeUser({ role: "instructor" });

    const res = await request(server)
      .get("/admin/activity-log")
      .set(auth(instructor));

    expect(res.status).toBe(403);
  });
});
