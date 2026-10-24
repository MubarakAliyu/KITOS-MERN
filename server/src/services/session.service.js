import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { Session } from "../models/Session.js";
import { Attendance } from "../models/Attendance.js";
import { Recording } from "../models/Recording.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { env } from "../config/env.js";
import { notFound, forbidden, badRequest } from "../lib/errors.js";
import { toPlainText } from "../lib/sanitizeContent.js";
import {
  computeSessionStatus,
  sessionEndsAt,
  isAttendanceOpen,
  attendanceWindow,
} from "../lib/sessionStatus.js";
import { QR_TOKEN_TTL_SECONDS } from "../config/constants.js";
import { logger } from "../lib/logger.js";

/**
 * Live and physical sessions, attendance and recordings (FR12–FR14).
 *
 * This replaces the client-side mock in `client/src/_lib/api/sessions.js`, so
 * the shapes here are that file's shapes: the retained screens read
 * `course_name`, `join_url`, `enrolled_count` and a computed `status`, and
 * they keep reading them.
 */

async function studentFor(user) {
  if (user.role !== "student") return null;
  return Student.findOne({ user_id: user._id });
}

/** The courses a user can see sessions for. */
async function visibleCourseIds(user) {
  if (user.role === "admin") return null; // null means "no restriction"

  if (user.role === "instructor") {
    const courses = await Course.find({ instructor_id: user._id }).select("_id");
    return courses.map((c) => c._id);
  }

  if (user.role === "student") {
    const student = await studentFor(user);
    if (!student) return [];
    const enrollments = await Enrollment.find({
      student_id: student._id,
      status: { $in: ["active", "completed"] },
    }).select("course_id");
    return enrollments.map((e) => e.course_id);
  }

  if (user.role === "parent") {
    const children = await Student.find({ parent_id: user._id }).select("_id");
    if (children.length === 0) return [];
    const enrollments = await Enrollment.find({
      student_id: { $in: children.map((c) => c._id) },
      status: { $in: ["active", "completed"] },
    }).select("course_id");
    return enrollments.map((e) => e.course_id);
  }

  return [];
}

/**
 * The session shape the retained screens read.
 *
 * `status` is computed, never stored (see lib/sessionStatus.js). Both
 * `course` and `course_name` are present because the mock carried both and
 * different components reach for different ones.
 */
export function serializeSession(session, { course, instructor, counts, recording } = {}) {
  const status = computeSessionStatus(session);

  return {
    id: String(session._id),
    title: session.title,
    description: session.description ?? "",
    course_id: String(session.course_id),
    course: course?.title ?? null,
    course_name: course?.title ?? null,
    cohort_id: session.cohort_id ? String(session.cohort_id) : null,
    instructor_id: session.instructor_id ? String(session.instructor_id) : null,
    instructor_name: instructor?.name ?? null,
    scheduled_at: session.scheduled_at?.toISOString() ?? null,
    duration_minutes: session.duration_minutes,
    ends_at: sessionEndsAt(session).toISOString(),
    session_number: session.session_number ?? null,
    mode: session.mode,
    // The screens call it join_url; the schema calls it meeting_url. Only
    // offered while the class is live or about to be.
    join_url: session.meeting_url ?? null,
    meeting_url: session.meeting_url ?? null,
    venue: session.venue ?? null,
    max_students: session.max_students ?? null,
    status,
    cancel_reason: session.cancel_reason ?? null,
    cancelled_at: session.cancelled_at?.toISOString() ?? null,
    rescheduled_from: session.rescheduled_from?.toISOString() ?? null,
    recording_url: recording?.url ?? null,
    enrolled_count: counts?.enrolled ?? 0,
    attended_count: counts?.attended ?? 0,
  };
}

/** Joins courses, instructors, counts and recordings for a list of sessions. */
async function hydrate(sessions) {
  if (sessions.length === 0) return [];

  const courseIds = [...new Set(sessions.map((s) => String(s.course_id)))];
  const instructorIds = [
    ...new Set(sessions.map((s) => String(s.instructor_id)).filter(Boolean)),
  ];
  const sessionIds = sessions.map((s) => s._id);

  const [courses, instructors, enrolments, attendance, recordings] =
    await Promise.all([
      Course.find({ _id: { $in: courseIds } }).select("title"),
      User.find({ _id: { $in: instructorIds } }).select("name"),
      Enrollment.aggregate([
        {
          $match: {
            course_id: { $in: courseIds.map((id) => toObjectId(id)) },
            status: { $in: ["active", "completed"] },
          },
        },
        { $group: { _id: "$course_id", count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $match: { session_id: { $in: sessionIds }, status: { $in: ["present", "late"] } } },
        { $group: { _id: "$session_id", count: { $sum: 1 } } },
      ]),
      Recording.find({ session_id: { $in: sessionIds } }).sort({ created_at: -1 }),
    ]);

  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const instructorById = new Map(instructors.map((i) => [String(i._id), i]));
  const enrolledByCourse = new Map(
    enrolments.map((e) => [String(e._id), e.count])
  );
  const attendedBySession = new Map(
    attendance.map((a) => [String(a._id), a.count])
  );
  const recordingBySession = new Map();
  for (const recording of recordings) {
    const key = String(recording.session_id);
    if (!recordingBySession.has(key)) recordingBySession.set(key, recording);
  }

  return sessions.map((session) =>
    serializeSession(session, {
      course: courseById.get(String(session.course_id)),
      instructor: instructorById.get(String(session.instructor_id)),
      counts: {
        enrolled: enrolledByCourse.get(String(session.course_id)) ?? 0,
        attended: attendedBySession.get(String(session._id)) ?? 0,
      },
      recording: recordingBySession.get(String(session._id)),
    })
  );
}

function toObjectId(id) {
  // Aggregations need real ObjectIds: find() coerces a string, but $match
  // does not, which is a quiet way to get an empty result rather than an
  // error.
  return new mongoose.Types.ObjectId(String(id));
}

/**
 * `GET /sessions?filter=all|live|upcoming|completed`.
 *
 * The filter runs after hydration because `status` is computed, not stored:
 * there is no query that can ask the database for "live".
 */
export async function listSessions({ user, filter = "all" }) {
  const courseIds = await visibleCourseIds(user);

  const query = {};
  if (courseIds !== null) {
    if (courseIds.length === 0) return [];
    query.course_id = { $in: courseIds };
  }
  if (user.role === "instructor") query.instructor_id = user._id;

  const sessions = await Session.find(query).sort({ scheduled_at: -1 });
  const hydrated = await hydrate(sessions);

  if (filter === "all") return hydrated;
  if (filter === "upcoming") {
    return hydrated.filter((s) => s.status === "scheduled");
  }
  return hydrated.filter((s) => s.status === filter);
}

export async function getSession({ user, sessionId }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");

  await assertCanView(user, session);

  const [hydrated] = await hydrate([session]);
  return hydrated;
}

/** A viewer must have the session's course in their visible set. */
async function assertCanView(user, session) {
  if (user.role === "admin") return;

  const courseIds = await visibleCourseIds(user);
  if (courseIds === null) return;

  const allowed = courseIds.some(
    (id) => String(id) === String(session.course_id)
  );
  if (!allowed) {
    throw forbidden(
      "You do not have access to this session",
      "Sessions are visible to the course's students, their parents and its instructor"
    );
  }
}

/** Only the session's instructor, or an admin, may change it. */
export function assertCanManage(user, session) {
  if (user.role === "admin") return;
  if (
    user.role === "instructor" &&
    String(session.instructor_id) === String(user._id)
  ) {
    return;
  }
  throw forbidden(
    "You do not have permission to manage this session",
    "An instructor may only manage their own sessions"
  );
}

export async function listInstructorSessions(user) {
  const query =
    user.role === "admin" ? {} : { instructor_id: user._id };
  const sessions = await Session.find(query).sort({ scheduled_at: -1 });
  return hydrate(sessions);
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createSession({ user, payload }) {
  const course = await Course.findById(payload.course_id);
  if (!course) {
    throw badRequest("Validation failed", undefined, {
      course_id: "No course found with that id",
    });
  }

  // An instructor schedules on their own courses; an admin anywhere.
  if (
    user.role === "instructor" &&
    String(course.instructor_id ?? "") !== String(user._id)
  ) {
    throw forbidden(
      "You do not have permission to schedule on this course",
      "An instructor may only schedule sessions for a course assigned to them"
    );
  }

  const scheduledAt = new Date(payload.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw badRequest("Validation failed", undefined, {
      scheduled_at: "Enter a valid date and time",
    });
  }

  const mode = payload.mode ?? "online";
  if ((mode === "online" || mode === "hybrid") && !payload.meeting_url) {
    throw badRequest("Validation failed", undefined, {
      meeting_url: "An online session needs a meeting link",
    });
  }
  if ((mode === "physical" || mode === "hybrid") && !payload.venue) {
    throw badRequest("Validation failed", undefined, {
      venue: "A physical session needs a venue",
    });
  }

  const session = await Session.create({
    title: toPlainText(payload.title, 160),
    description: toPlainText(payload.description ?? "", 2000),
    course_id: course._id,
    cohort_id: payload.cohort_id ?? null,
    instructor_id:
      user.role === "instructor" ? user._id : payload.instructor_id ?? course.instructor_id,
    scheduled_at: scheduledAt,
    duration_minutes: payload.duration_minutes ?? 60,
    session_number: payload.session_number ?? null,
    mode,
    meeting_url: payload.meeting_url ?? null,
    venue: payload.venue ?? null,
    max_students: payload.max_students ?? null,
  });

  await notifyCourse(session, {
    type: "session_scheduled",
    title: "New class scheduled",
    message: `${session.title} is on ${scheduledAt.toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
    })}.`,
  });

  const [hydrated] = await hydrate([session]);
  return hydrated;
}

export async function updateSession({ user, sessionId, payload }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  if (payload.title !== undefined) session.title = toPlainText(payload.title, 160);
  if (payload.description !== undefined) {
    session.description = toPlainText(payload.description, 2000);
  }
  if (payload.duration_minutes !== undefined) {
    session.duration_minutes = payload.duration_minutes;
  }
  if (payload.mode !== undefined) session.mode = payload.mode;
  if (payload.meeting_url !== undefined) session.meeting_url = payload.meeting_url;
  if (payload.venue !== undefined) session.venue = payload.venue;
  if (payload.max_students !== undefined) session.max_students = payload.max_students;
  if (payload.session_number !== undefined) {
    session.session_number = payload.session_number;
  }
  if (payload.scheduled_at !== undefined) {
    const when = new Date(payload.scheduled_at);
    if (Number.isNaN(when.getTime())) {
      throw badRequest("Validation failed", undefined, {
        scheduled_at: "Enter a valid date and time",
      });
    }
    session.scheduled_at = when;
  }

  await session.save();
  const [hydrated] = await hydrate([session]);
  return hydrated;
}

export async function cancelSession({ user, sessionId, reason }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  session.status = "cancelled";
  session.cancel_reason = toPlainText(reason ?? "", 500) || "No reason given";
  session.cancelled_at = new Date();
  await session.save();

  // Families plan around these; tell them.
  await notifyCourse(session, {
    type: "session_cancelled",
    title: "Class cancelled",
    message: `${session.title} has been cancelled. ${session.cancel_reason}`,
  });

  const [hydrated] = await hydrate([session]);
  return hydrated;
}

export async function rescheduleSession({ user, sessionId, scheduledAt }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    throw badRequest("Validation failed", undefined, {
      scheduled_at: "Enter a valid date and time",
    });
  }

  session.rescheduled_from = session.scheduled_at;
  session.scheduled_at = when;
  // A moved class has to chase its reminders again.
  session.reminders_sent = [];
  // Rescheduling revives a cancelled class rather than leaving it dead.
  if (session.status === "cancelled") {
    session.status = "scheduled";
    session.cancel_reason = null;
    session.cancelled_at = null;
  }
  await session.save();

  await notifyCourse(session, {
    type: "session_rescheduled",
    title: "Class moved",
    message: `${session.title} is now on ${when.toLocaleString("en-GB", {
      timeZone: "Africa/Lagos",
    })}.`,
  });

  const [hydrated] = await hydrate([session]);
  return hydrated;
}

/** Cancelled sessions, for the cancellations screen. */
export async function listCancellations(user) {
  const courseIds = await visibleCourseIds(user);
  const query = { status: "cancelled" };
  if (courseIds !== null) {
    if (courseIds.length === 0) return [];
    query.course_id = { $in: courseIds };
  }

  const sessions = await Session.find(query).sort({ cancelled_at: -1 });
  return hydrate(sessions);
}

/**
 * Notifies everyone enrolled on a session's course, and their parents.
 *
 * Best-effort: a class is still cancelled whether or not the notification
 * lands, and failing the cancel because a notification failed would be worse.
 */
async function notifyCourse(session, { type, title, message }) {
  try {
    const enrollments = await Enrollment.find({
      course_id: session.course_id,
      status: { $in: ["active", "completed"] },
    }).select("student_id");
    if (enrollments.length === 0) return;

    const students = await Student.find({
      _id: { $in: enrollments.map((e) => e.student_id) },
    }).select("user_id parent_id");

    const recipients = new Set();
    for (const student of students) {
      if (student.user_id) recipients.add(String(student.user_id));
      if (student.parent_id) recipients.add(String(student.parent_id));
    }
    if (recipients.size === 0) return;

    await Notification.insertMany(
      [...recipients].map((userId) => ({
        user_id: userId,
        type,
        title,
        message,
        link: "/student/sessions",
      }))
    );
  } catch (err) {
    logger.error({ err, session_id: String(session._id) }, "Could not notify course");
  }
}

// ── Attendance ──────────────────────────────────────────────────────────────

/**
 * `GET /sessions/:id/roster` — everyone enrolled, with their current mark.
 */
export async function getRoster({ user, sessionId }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  const enrollments = await Enrollment.find({
    course_id: session.course_id,
    status: { $in: ["active", "completed"] },
  }).select("student_id");

  const students = await Student.find({
    _id: { $in: enrollments.map((e) => e.student_id) },
  }).sort({ name: 1 });

  const accounts = await User.find({
    _id: { $in: students.map((s) => s.user_id) },
  }).select("admission_no");
  const admissionByUser = new Map(
    accounts.map((a) => [String(a._id), a.admission_no])
  );

  const marks = await Attendance.find({ session_id: session._id });
  const markByStudent = new Map(marks.map((m) => [String(m.student_id), m]));

  const window = attendanceWindow(session);

  return {
    session_id: String(session._id),
    session_title: session.title,
    scheduled_at: session.scheduled_at.toISOString(),
    status: computeSessionStatus(session),
    attendance_open: isAttendanceOpen(session),
    attendance_opens_at: window.opens.toISOString(),
    attendance_closes_at: window.closes.toISOString(),
    students: students.map((student) => {
      const mark = markByStudent.get(String(student._id));
      return {
        student_id: String(student._id),
        id: String(student._id),
        name: student.name,
        admission_no: admissionByUser.get(String(student.user_id)) ?? null,
        status: mark?.status ?? null,
        method: mark?.method ?? null,
        marked_at: mark?.marked_at?.toISOString() ?? null,
      };
    }),
  };
}

/**
 * `PUT /sessions/:id/attendance` — the instructor saves the register.
 *
 * Only inside the window: from 15 minutes before the start to 24 hours after
 * the end. Early because registers are taken as pupils arrive; late because a
 * forgotten register should be fixable the next day — but not next week, when
 * nobody remembers who was actually there.
 */
export async function saveAttendance({ user, sessionId, records }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  if (!isAttendanceOpen(session)) {
    const window = attendanceWindow(session);
    throw forbidden(
      "Attendance is closed for this session",
      session.status === "cancelled"
        ? "This session was cancelled"
        : `It can be recorded between ${window.opens.toISOString()} and ${window.closes.toISOString()}`
    );
  }

  const enrolled = await Enrollment.find({
    course_id: session.course_id,
    status: { $in: ["active", "completed"] },
  }).select("student_id");
  const enrolledIds = new Set(enrolled.map((e) => String(e.student_id)));

  const operations = [];
  const rejected = [];

  for (const record of records ?? []) {
    const studentId = String(record.student_id ?? "");
    if (!enrolledIds.has(studentId)) {
      // Marking someone who is not on the course is a mistake, not a silent
      // no-op: say which.
      rejected.push(studentId);
      continue;
    }

    operations.push({
      updateOne: {
        filter: { session_id: session._id, student_id: studentId },
        update: {
          $set: {
            status: record.status,
            method: "roster",
            marked_by: user._id,
            marked_at: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (rejected.length > 0) {
    throw badRequest(
      "Some of those students are not enrolled on this course",
      `Unrecognised: ${rejected.length}`
    );
  }

  if (operations.length > 0) {
    await Attendance.bulkWrite(operations);
  }

  return { success: true, saved: operations.length };
}

export async function getSessionAttendance({ user, sessionId }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  await assertCanView(user, session);

  const marks = await Attendance.find({ session_id: session._id });
  const students = await Student.find({
    _id: { $in: marks.map((m) => m.student_id) },
  }).select("name");
  const nameById = new Map(students.map((s) => [String(s._id), s.name]));

  return marks.map((mark) => ({
    id: String(mark._id),
    session_id: String(mark.session_id),
    student_id: String(mark.student_id),
    student_name: nameById.get(String(mark.student_id)) ?? null,
    status: mark.status,
    method: mark.method,
    marked_at: mark.marked_at?.toISOString() ?? null,
  }));
}

// ── QR check-in ─────────────────────────────────────────────────────────────

/**
 * A short-lived token the instructor displays as a QR code (FR13).
 *
 * 60 seconds, signed with the server's secret, and carrying the session id.
 * The lifetime is the security control: a photograph of the screen is useless
 * a minute later, so a pupil cannot send the code to a friend at home. The
 * `purpose` claim means it cannot be presented as an access token.
 */
export async function createQrToken({ user, sessionId }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  const status = computeSessionStatus(session);
  if (status === "cancelled") {
    throw badRequest("This session was cancelled");
  }

  const token = jwt.sign(
    { sid: String(session._id), purpose: "attendance" },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: QR_TOKEN_TTL_SECONDS }
  );

  return {
    token,
    expires_in: QR_TOKEN_TTL_SECONDS,
    expires_at: new Date(Date.now() + QR_TOKEN_TTL_SECONDS * 1000).toISOString(),
    session_id: String(session._id),
  };
}

/**
 * `POST /sessions/:id/check-in` — the student marks themselves present.
 *
 * Two ways in: a scanned QR token, or `method: "auto"` when they open an
 * online class's meeting link. Either way they must be enrolled and the
 * session must be live; a token for a *different* session is refused, which
 * is the obvious way someone would try to be in two classes at once.
 */
export async function checkIn({ user, sessionId, token, method = "qr" }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");

  const student = await studentFor(user);
  if (!student) {
    throw forbidden("Only a student can check in to a session");
  }

  const enrolled = await Enrollment.findOne({
    student_id: student._id,
    course_id: session.course_id,
    status: { $in: ["active", "completed"] },
  });
  if (!enrolled) {
    throw forbidden(
      "You are not enrolled on this course",
      "Only enrolled students can check in"
    );
  }

  const status = computeSessionStatus(session);
  if (status !== "live") {
    throw badRequest(
      "This session is not running",
      status === "scheduled"
        ? "You can check in once the class starts"
        : `The class is ${status}`
    );
  }

  if (method === "qr") {
    if (!token) {
      throw badRequest("Validation failed", undefined, {
        token: "Scan the code the instructor is showing",
      });
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      throw badRequest(
        err?.name === "TokenExpiredError"
          ? "That code has expired — ask for a fresh one"
          : "That code is not valid"
      );
    }

    if (payload.purpose !== "attendance") {
      throw badRequest("That code is not a check-in code");
    }
    if (String(payload.sid) !== String(session._id)) {
      throw badRequest("That code belongs to a different session");
    }
  }

  // Late if they arrive more than 10 minutes in — recorded, not punished.
  const minutesIn =
    (Date.now() - new Date(session.scheduled_at).getTime()) / 60000;
  const mark = minutesIn > 10 ? "late" : "present";

  await Attendance.findOneAndUpdate(
    { session_id: session._id, student_id: student._id },
    {
      $set: {
        status: mark,
        method,
        marked_by: user._id,
        marked_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    success: true,
    status: mark,
    method,
    session_id: String(session._id),
    checked_in_at: new Date().toISOString(),
  };
}

// ── Recordings ──────────────────────────────────────────────────────────────

export async function addRecording({ user, sessionId, payload }) {
  const session = await Session.findById(sessionId);
  if (!session) throw notFound("Session not found");
  assertCanManage(user, session);

  const recording = await Recording.create({
    session_id: session._id,
    title: toPlainText(payload.title ?? session.title, 160),
    url: payload.url,
    source: payload.source ?? "youtube",
    added_by: user._id,
  });

  await notifyCourse(session, {
    type: "recording_added",
    title: "Recording available",
    message: `The recording of ${session.title} is ready to watch.`,
  });

  return {
    id: String(recording._id),
    session_id: String(recording.session_id),
    title: recording.title,
    url: recording.url,
    source: recording.source,
    created_at: recording.created_at?.toISOString() ?? null,
  };
}

/** Recordings for the sessions a user can see. */
export async function listRecordings(user) {
  const courseIds = await visibleCourseIds(user);
  const query = {};
  if (courseIds !== null) {
    if (courseIds.length === 0) return [];
    query.course_id = { $in: courseIds };
  }

  const sessions = await Session.find(query).select(
    "title course_id scheduled_at"
  );
  if (sessions.length === 0) return [];

  const recordings = await Recording.find({
    session_id: { $in: sessions.map((s) => s._id) },
  }).sort({ created_at: -1 });

  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));
  const courses = await Course.find({
    _id: { $in: sessions.map((s) => s.course_id) },
  }).select("title");
  const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));

  return recordings.map((recording) => {
    const session = sessionById.get(String(recording.session_id));
    return {
      id: String(recording._id),
      session_id: String(recording.session_id),
      session_title: session?.title ?? null,
      course_id: session ? String(session.course_id) : null,
      course_title: session ? courseTitle.get(String(session.course_id)) ?? null : null,
      title: recording.title,
      url: recording.url,
      source: recording.source,
      recorded_at: session?.scheduled_at?.toISOString() ?? null,
      created_at: recording.created_at?.toISOString() ?? null,
    };
  });
}

// ── Admin views ─────────────────────────────────────────────────────────────

export async function adminOverview() {
  const sessions = await Session.find({});
  const hydrated = await hydrate(sessions);

  const counts = { live: 0, scheduled: 0, completed: 0, cancelled: 0 };
  for (const session of hydrated) counts[session.status] += 1;

  const attendanceRows = await Attendance.countDocuments({
    status: { $in: ["present", "late"] },
  });

  return {
    total_sessions: sessions.length,
    live_now: counts.live,
    upcoming: counts.scheduled,
    completed: counts.completed,
    cancelled: counts.cancelled,
    total_attendance_marks: attendanceRows,
    live_sessions: hydrated.filter((s) => s.status === "live"),
    upcoming_sessions: hydrated
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 5),
  };
}

export async function adminAllSessions(filters = {}) {
  const query = {};
  if (filters.course_id) query.course_id = filters.course_id;
  if (filters.instructor_id) query.instructor_id = filters.instructor_id;

  const sessions = await Session.find(query).sort({ scheduled_at: -1 });
  const hydrated = await hydrate(sessions);

  if (filters.status && filters.status !== "all") {
    return hydrated.filter((s) => s.status === filters.status);
  }
  return hydrated;
}

/**
 * The attendance report: per course, per student, with a percentage.
 *
 * Only sessions that have actually happened count toward the denominator —
 * counting a class scheduled for next week as an absence would make every
 * pupil look truant.
 */
export async function attendanceReport() {
  const sessions = await Session.find({ status: { $ne: "cancelled" } });
  const held = sessions.filter(
    (session) => computeSessionStatus(session) === "completed"
  );

  if (held.length === 0) {
    return { courses: [], students: [], overall_rate: 0, sessions_held: 0 };
  }

  const heldIds = held.map((s) => s._id);
  const [marks, courses, students] = await Promise.all([
    Attendance.find({ session_id: { $in: heldIds } }),
    Course.find({ _id: { $in: held.map((s) => s.course_id) } }).select("title"),
    Student.find({}).select("name"),
  ]);

  const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));
  const studentName = new Map(students.map((s) => [String(s._id), s.name]));
  const sessionCourse = new Map(
    held.map((s) => [String(s._id), String(s.course_id)])
  );

  const sessionsPerCourse = new Map();
  for (const session of held) {
    const key = String(session.course_id);
    sessionsPerCourse.set(key, (sessionsPerCourse.get(key) ?? 0) + 1);
  }

  const presentByCourse = new Map();
  const perStudent = new Map();

  for (const mark of marks) {
    const courseId = sessionCourse.get(String(mark.session_id));
    const present = mark.status === "present" || mark.status === "late";

    if (courseId && present) {
      presentByCourse.set(courseId, (presentByCourse.get(courseId) ?? 0) + 1);
    }

    const key = String(mark.student_id);
    if (!perStudent.has(key)) {
      perStudent.set(key, { present: 0, recorded: 0, methods: {} });
    }
    const row = perStudent.get(key);
    row.recorded += 1;
    if (present) row.present += 1;
    row.methods[mark.method] = (row.methods[mark.method] ?? 0) + 1;
  }

  const enrollments = await Enrollment.find({
    course_id: { $in: [...sessionsPerCourse.keys()] },
    status: { $in: ["active", "completed"] },
  }).select("student_id course_id");

  const expectedPerCourse = new Map();
  for (const enrollment of enrollments) {
    const key = String(enrollment.course_id);
    expectedPerCourse.set(
      key,
      (expectedPerCourse.get(key) ?? 0) + (sessionsPerCourse.get(key) ?? 0)
    );
  }

  const courseRows = [...sessionsPerCourse.entries()].map(([courseId, count]) => {
    const expected = expectedPerCourse.get(courseId) ?? 0;
    const present = presentByCourse.get(courseId) ?? 0;
    return {
      course_id: courseId,
      course_title: courseTitle.get(courseId) ?? null,
      sessions_held: count,
      expected_marks: expected,
      present_marks: present,
      rate: expected > 0 ? Math.round((present / expected) * 100) : 0,
    };
  });

  const studentRows = [...perStudent.entries()].map(([studentId, row]) => ({
    student_id: studentId,
    student_name: studentName.get(studentId) ?? null,
    sessions_attended: row.present,
    sessions_recorded: row.recorded,
    rate: row.recorded > 0 ? Math.round((row.present / row.recorded) * 100) : 0,
    by_method: row.methods,
  }));

  const totalExpected = [...expectedPerCourse.values()].reduce((a, b) => a + b, 0);
  const totalPresent = [...presentByCourse.values()].reduce((a, b) => a + b, 0);

  return {
    sessions_held: held.length,
    courses: courseRows,
    students: studentRows.sort((a, b) => b.rate - a.rate),
    overall_rate:
      totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0,
  };
}
