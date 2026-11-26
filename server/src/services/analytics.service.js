import { User } from "../models/User.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { QuizAttempt } from "../models/QuizAttempt.js";
import { Session } from "../models/Session.js";
import { Attendance } from "../models/Attendance.js";
import { Payment } from "../models/Payment.js";
import { Subscription } from "../models/Subscription.js";
import { koboToNaira } from "../lib/serialize.js";
import { computeSessionStatus } from "../lib/sessionStatus.js";
import { lastMonths } from "./payment.service.js";

/**
 * The admin dashboard tiles and the analytics charts (FR18).
 *
 * Every figure here is computed from the collections, never stored. An
 * administrator looking at a dashboard is asking "what is true now?", and a
 * cached total is a number that was true once — which is worse than slow,
 * because nobody can tell by looking.
 *
 * The shapes are the ones the retained Recharts components read, key for key:
 * a renamed field does not degrade a chart, it draws an empty one.
 */

/** Brand colours, as the donut's fixture used them. */
const SUBSCRIPTION_FILL = "#10B981";
const ONE_TIME_FILL = "#1a2234";

/** `YYYY-MM` in Lagos, so a record at 00:30 lands in the local month. */
function monthKey(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date ?? new Date());
  return `${parts.find((p) => p.type === "year").value}-${
    parts.find((p) => p.type === "month").value
  }`;
}

/**
 * A course title short enough for the completion chart's 80px axis.
 *
 * "Web Development" has to become "Web Dev" or the label is clipped, which
 * is what the fixture did by hand. Truncating at a word boundary keeps it
 * readable rather than cutting mid-word.
 */
function shortTitle(title) {
  const text = String(title ?? "").trim();
  if (text.length <= 12) return text;

  const [first, second] = text.split(/\s+/);

  // A long first word says enough on its own: "Scratch Programming" reads
  // as "Scratch". A short one needs the second to stay distinct, so
  // "Web Development" becomes "Web Dev" rather than the clipped "Web Developm".
  if (first.length >= 6) return first.slice(0, 12);
  if (!second) return first.slice(0, 12);

  // Three characters, so it reads as a deliberate abbreviation — "Web Dev",
  // which is what the design used — rather than a word cut off mid-way.
  return `${first} ${second.slice(0, 3)}`;
}

/**
 * Platform counts for the dashboard tiles.
 *
 * The `*_change` figures compare this month with last, which is what the
 * arrows beside each tile mean. They were zeros until this batch, when the
 * collections they need finally existed.
 */
export async function getStats() {
  // `lastMonths` returns oldest first, so this month is the *last* entry.
  // Reading them the other way round inverts every change arrow on the
  // dashboard, which looks plausible and is wrong.
  const months = lastMonths(2);
  const [lastMonth, thisMonth] = months.map((m) => m.key);

  const [
    students,
    instructors,
    courses,
    paidPayments,
    activeSubscriptions,
    studentUsers,
    courseDocs,
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "instructor" }),
    Course.countDocuments({}),
    Payment.find({ status: "paid" }).select("amount_kobo created_at"),
    Subscription.countDocuments({ status: "active" }),
    User.find({ role: "student" }).select("created_at"),
    Course.find({}).select("created_at"),
  ]);

  const instructorUsers = await User.find({ role: "instructor" }).select(
    "created_at"
  );

  const revenueKobo = paidPayments.reduce((sum, p) => sum + p.amount_kobo, 0);

  /** How many of `rows` were created in a given month. */
  const inMonth = (rows, key) =>
    rows.filter((row) => monthKey(row.created_at) === key).length;

  const revenueIn = (key) =>
    paidPayments
      .filter((p) => monthKey(p.created_at) === key)
      .reduce((sum, p) => sum + p.amount_kobo, 0);

  /**
   * A percentage change, guarding the case that makes these tiles lie:
   * nothing last month. Growth from zero is not "infinite per cent", so it
   * reports the count itself as the change, which is what the arrow beside a
   * small number should convey.
   */
  const change = (now, before) => {
    if (before === 0) return now === 0 ? 0 : now;
    return Math.round(((now - before) / before) * 100);
  };

  return {
    total_students: students,
    total_instructors: instructors,
    total_courses: courses,
    total_revenue: koboToNaira(revenueKobo),
    active_subscriptions: activeSubscriptions,
    students_change: change(
      inMonth(studentUsers, thisMonth),
      inMonth(studentUsers, lastMonth)
    ),
    revenue_change: change(
      koboToNaira(revenueIn(thisMonth)),
      koboToNaira(revenueIn(lastMonth))
    ),
    courses_change: inMonth(courseDocs, thisMonth),
    instructors_change: inMonth(instructorUsers, thisMonth),
  };
}

/**
 * The five series the analytics screen charts, plus two scalars the batch
 * brief asks for (attendance rate and active users) which no chart draws yet.
 *
 * @param {{ months?: number }} [query]
 */
export async function getAnalytics(query = {}) {
  const span = query.months ?? 6;
  const months = lastMonths(span);

  const [enrolments, payments, courses, attempts, sessions, attendance, activeUsers] =
    await Promise.all([
      Enrollment.find({}).select("created_at status course_id"),
      Payment.find({ status: "paid" }).select("amount_kobo type created_at"),
      Course.find({}).select("title"),
      QuizAttempt.find({}).select("percentage created_at"),
      Session.find({}).select("scheduled_at duration_minutes status course_id"),
      Attendance.find({}).select("session_id status"),
      User.countDocuments({ is_active: true }),
    ]);

  // ── Enrolment trend: cumulative, so the line only ever climbs ──────────
  // Per-month arrivals would show a dip for a quiet month and read as pupils
  // leaving. The fixture's shape was cumulative for the same reason.
  const enrollment_trend = months.map(({ key, label }) => ({
    month: label,
    students: enrolments.filter((e) => monthKey(e.created_at) <= key).length,
  }));

  // ── Revenue by month and the subscription / one-off split ──────────────
  const revenueBuckets = new Map(
    months.map(({ key, label }) => [
      key,
      { month: label, subscription: 0, one_time: 0 },
    ])
  );
  let subscriptionKobo = 0;
  let oneTimeKobo = 0;

  for (const payment of payments) {
    if (payment.type === "subscription") subscriptionKobo += payment.amount_kobo;
    else oneTimeKobo += payment.amount_kobo;

    const bucket = revenueBuckets.get(monthKey(payment.created_at));
    if (bucket) bucket[payment.type] += koboToNaira(payment.amount_kobo);
  }

  const revenue_monthly = months.map(({ key }) => revenueBuckets.get(key));

  const payment_split = [
    {
      name: "Subscription",
      value: koboToNaira(subscriptionKobo),
      fill: SUBSCRIPTION_FILL,
    },
    { name: "One-time", value: koboToNaira(oneTimeKobo), fill: ONE_TIME_FILL },
  ];

  // ── Completion rate per course ─────────────────────────────────────────
  const course_completion = courses
    .map((course) => {
      const onCourse = enrolments.filter(
        (e) => String(e.course_id) === String(course._id)
      );
      const completed = onCourse.filter((e) => e.status === "completed").length;
      return {
        course: shortTitle(course.title),
        // A course nobody is on is 0%, not "no data": the bar is honestly
        // empty rather than absent from the chart.
        rate: onCourse.length === 0 ? 0 : Math.round((completed / onCourse.length) * 100),
      };
    })
    .sort((a, b) => b.rate - a.rate);

  // ── Quiz averages by month ─────────────────────────────────────────────
  const quizBuckets = new Map(months.map(({ key }) => [key, []]));
  for (const attempt of attempts) {
    const bucket = quizBuckets.get(monthKey(attempt.created_at));
    if (bucket) bucket.push(attempt.percentage);
  }

  // Only months with attempts are plotted. A month averaging zero because
  // nobody sat a quiz would read as a cohort that failed everything.
  const quiz_performance = months
    .filter(({ key }) => quizBuckets.get(key).length > 0)
    .map(({ key, label }) => {
      const scores = quizBuckets.get(key);
      return {
        month: label,
        average: Math.round(
          scores.reduce((sum, value) => sum + value, 0) / scores.length
        ),
      };
    });

  // ── Attendance rate ────────────────────────────────────────────────────
  // Only over classes that have actually been held: a class still to come
  // would drag the rate down for no reason (the same rule the session report
  // uses).
  const held = sessions.filter(
    (session) => computeSessionStatus(session) === "completed"
  );
  const heldIds = new Set(held.map((s) => String(s._id)));
  const marksForHeld = attendance.filter((mark) =>
    heldIds.has(String(mark.session_id))
  );
  const present = marksForHeld.filter((mark) =>
    ["present", "late"].includes(mark.status)
  ).length;

  const expected = held.reduce((sum, session) => {
    const onCourse = enrolments.filter(
      (e) => String(e.course_id) === String(session.course_id)
    ).length;
    return sum + onCourse;
  }, 0);

  return {
    enrollment_trend,
    revenue_monthly,
    course_completion,
    quiz_performance,
    payment_split,
    // Not charted by the retained UI; asked for by the batch brief, and
    // cheap to compute while everything is already loaded.
    attendance_rate: expected === 0 ? 0 : Math.round((present / expected) * 100),
    active_users: activeUsers,
    sessions_held: held.length,
  };
}
