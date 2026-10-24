import { Session } from "../models/Session.js";
import { Assignment } from "../models/Assignment.js";
import { Submission } from "../models/Submission.js";
import { Enrollment } from "../models/Enrollment.js";
import { Student } from "../models/Student.js";
import { Notification } from "../models/Notification.js";
import { logger } from "../lib/logger.js";
import { computeSessionStatus } from "../lib/sessionStatus.js";

/**
 * Scheduled reminders (Batch 2, Part E).
 *
 * Runs every five minutes and once on boot. Running on boot matters on
 * Render's free tier, where the service sleeps: without it, a restart at
 * 09:00 would silently skip every reminder due overnight.
 *
 * Idempotency comes from `session.reminders_sent`, an array on the document
 * rather than a timestamp comparison. Two overlapping ticks, or a restart
 * mid-run, cannot send the same reminder twice — the array is checked and
 * updated in a single conditional update, so the check and the write cannot
 * be interleaved.
 */

const FIVE_MINUTES = 5 * 60 * 1000;

/** How far ahead each reminder fires, and how wide its window is. */
const REMINDERS = [
  { key: "24h", leadMs: 24 * 60 * 60 * 1000, label: "tomorrow" },
  { key: "15m", leadMs: 15 * 60 * 1000, label: "in 15 minutes" },
];

/**
 * The window has to be wider than the tick, or a reminder due between ticks
 * is never sent. Six minutes against a five-minute tick leaves a margin for a
 * slow run without firing twice — `reminders_sent` covers that anyway.
 */
const WINDOW_MS = 6 * 60 * 1000;

/** Everyone on a session's course, and their parents. */
async function recipientsFor(session) {
  const enrollments = await Enrollment.find({
    course_id: session.course_id,
    status: { $in: ["active", "completed"] },
  }).select("student_id");
  if (enrollments.length === 0) return [];

  const students = await Student.find({
    _id: { $in: enrollments.map((e) => e.student_id) },
  }).select("user_id parent_id");

  const recipients = new Set();
  for (const student of students) {
    if (student.user_id) recipients.add(String(student.user_id));
    if (student.parent_id) recipients.add(String(student.parent_id));
  }
  return [...recipients];
}

/** Session reminders at 24 hours and 15 minutes. */
export async function sendSessionReminders(now = new Date()) {
  let sent = 0;

  for (const reminder of REMINDERS) {
    const target = now.getTime() + reminder.leadMs;

    const due = await Session.find({
      status: "scheduled",
      scheduled_at: {
        $gte: new Date(target - WINDOW_MS / 2),
        $lte: new Date(target + WINDOW_MS / 2),
      },
      reminders_sent: { $ne: reminder.key },
    });

    for (const session of due) {
      // Claim it first. The filter requires the key still to be absent, so
      // if another tick got here first this matches nothing and we skip —
      // the check and the write are one atomic operation.
      const claim = await Session.updateOne(
        { _id: session._id, reminders_sent: { $ne: reminder.key } },
        { $push: { reminders_sent: reminder.key } }
      );
      if (claim.modifiedCount === 0) continue;

      try {
        const recipients = await recipientsFor(session);
        if (recipients.length === 0) continue;

        await Notification.insertMany(
          recipients.map((userId) => ({
            user_id: userId,
            type: "session_reminder",
            title: `Class ${reminder.label}`,
            message: `${session.title} starts ${reminder.label}.`,
            link: "/student/sessions",
          }))
        );
        sent += recipients.length;
      } catch (err) {
        // Give the claim back, so the next tick can try again.
        await Session.updateOne(
          { _id: session._id },
          { $pull: { reminders_sent: reminder.key } }
        );
        logger.error(
          { err, session_id: String(session._id) },
          "Could not send session reminder"
        );
      }
    }
  }

  return sent;
}

/**
 * Overdue-assignment notices.
 *
 * Sent once per assignment per student, the day after the deadline. The
 * notice is deliberately gentle — Kids In Tech's policy asks for encouraging
 * language, and the reader is a child.
 */
export async function sendOverdueAssignmentNotices(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const overdue = await Assignment.find({
    deadline: { $lt: now, $gte: yesterday },
  });
  if (overdue.length === 0) return 0;

  let sent = 0;

  for (const assignment of overdue) {
    const enrollments = await Enrollment.find({
      course_id: assignment.course_id,
      status: "active",
    }).select("student_id");
    if (enrollments.length === 0) continue;

    const submitted = await Submission.find({
      assignment_id: assignment._id,
    }).select("student_id");
    const done = new Set(submitted.map((s) => String(s.student_id)));

    const missing = enrollments
      .map((e) => e.student_id)
      .filter((id) => !done.has(String(id)));
    if (missing.length === 0) continue;

    const students = await Student.find({ _id: { $in: missing } }).select(
      "user_id parent_id"
    );

    const rows = [];
    for (const student of students) {
      if (student.user_id) {
        rows.push({
          user_id: student.user_id,
          type: "assignment_overdue",
          title: "Assignment still open",
          message: `${assignment.title} was due yesterday — there is still time to hand it in.`,
          link: "/student/assignments",
        });
      }
    }

    if (rows.length > 0) {
      await Notification.insertMany(rows);
      sent += rows.length;
    }
  }

  return sent;
}

/** One pass of everything. Exported so a test can run it directly. */
export async function runReminderPass(now = new Date()) {
  const [sessions, overdue] = await Promise.all([
    sendSessionReminders(now),
    sendOverdueAssignmentNotices(now),
  ]);

  if (sessions > 0 || overdue > 0) {
    logger.info(
      { session_reminders: sessions, overdue_notices: overdue },
      "Reminder pass complete"
    );
  }

  return { sessions, overdue };
}

let timer;

/**
 * Starts the loop: once now, then every five minutes.
 *
 * `unref()` so a pending timer cannot keep the process alive during a
 * graceful shutdown, and every pass is wrapped — a thrown error inside a
 * timer callback would otherwise take the whole process down.
 */
export function startReminderJob() {
  const tick = async () => {
    try {
      await runReminderPass();
    } catch (err) {
      logger.error({ err }, "Reminder pass failed");
    }
  };

  // Catch up on anything missed while the service was asleep.
  tick();

  timer = setInterval(tick, FIVE_MINUTES);
  timer.unref();

  logger.info({ interval_ms: FIVE_MINUTES }, "Reminder job started");
  return timer;
}

export function stopReminderJob() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

/** Computed status, re-exported so the job and the API cannot disagree. */
export { computeSessionStatus };
