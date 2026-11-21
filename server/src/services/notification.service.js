import sanitizeHtml from "sanitize-html";
import { Notification } from "../models/Notification.js";
import { Announcement } from "../models/Announcement.js";
import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { notFound, forbidden, badRequest } from "../lib/errors.js";
import { can } from "../config/permissions.js";
import { pushNotification } from "../realtime/emit.js";

/**
 * Notifications.
 *
 * The read side and mark-as-read shipped in Batch 1 (ADR-019): the model and
 * real rows already existed — a parent adding a child notifies every
 * administrator — and AC1.1 required the dashboards to load with no console
 * errors, which a 404 on the bell feed would have broken.
 *
 * Batch 3 completes it: audience targeting including by course, fan-out in
 * batches, the Announcement record of what was sent, and a Socket.IO push so
 * the bell updates without a refresh (FR17).
 */

/** Strips every tag: these strings are rendered as text in the bell dropdown. */
const asPlainText = (value, max) =>
  sanitizeHtml(String(value ?? ""), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);

/**
 * One user's feed, newest first.
 *
 * The frontend passes `?user_id=` because the mock handlers were keyed that
 * way. It is ignored unless the caller is an admin: a feed is private, and
 * reading someone else's by guessing their id would be a trivial leak. Every
 * other caller gets their own.
 */
export async function listNotifications({ user, userId }) {
  const target =
    userId && user.role === "admin" ? userId : String(user._id);

  const rows = await Notification.find({ user_id: target })
    .sort({ created_at: -1 })
    .limit(100);

  return rows.map((row) => ({
    id: String(row._id),
    user_id: String(row.user_id),
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link ?? null,
    is_read: row.is_read,
    created_at: row.created_at?.toISOString() ?? null,
  }));
}

/** Marks one notification read. Only the owner may. */
export async function markRead({ user, id }) {
  const row = await Notification.findById(id);
  if (!row) throw notFound("Notification not found");

  if (String(row.user_id) !== String(user._id)) {
    throw forbidden("You do not have permission to do that");
  }

  row.is_read = true;
  await row.save();
  return { success: true };
}

/** Marks the caller's whole feed read. */
export async function markAllRead({ user }) {
  const result = await Notification.updateMany(
    { user_id: user._id, is_read: false },
    { $set: { is_read: true } }
  );
  return { success: true, updated: result.modifiedCount ?? 0 };
}

/**
 * Sends a notification, to one audience.
 *
 * Two quite different callers share this endpoint in the frontend:
 *   - `adminNotify.js` fires platform events ("a student signed in", "a
 *     payment arrived") from any signed-in user's browser;
 *   - the admin Announcement modal broadcasts to an audience.
 *
 * So a non-admin may only notify administrators, whatever they ask for. If
 * any user could choose the audience, a pupil could reach every parent on the
 * platform in one request. Audience targeting is administrators only.
 */
export async function sendNotification({ user, payload }) {
  const isAdmin = can(user.role, "settings.manage");

  const title = asPlainText(payload.title, 120) || "Notification";
  const message = asPlainText(payload.message, 1000);
  const link = payload.link ? asPlainText(payload.link, 300) : null;
  const type = asPlainText(payload.type, 60) || "system";

  if (!isAdmin) {
    // Platform event from a normal user: administrators only, and not
    // recorded as an announcement, because it is not one.
    const admins = await User.find({ role: "admin", is_active: true }).select("_id");
    const delivered = await fanOut({
      recipientIds: admins.map((a) => a._id),
      type,
      title,
      message,
      link,
    });
    return { success: true, delivered };
  }

  const audience = payload.audience ?? "all";
  const role = payload.target ?? payload.role ?? null;
  const courseId = payload.course_id ?? null;

  const recipientIds = await resolveAudience({ audience, role, courseId });

  const delivered = await fanOut({
    recipientIds,
    type,
    title,
    message,
    link,
  });

  // The sent item. The notifications themselves are per-recipient documents,
  // read and dismissed individually, so none of them records what the
  // broadcast was or how far it reached.
  const announcement = await Announcement.create({
    title,
    message,
    audience,
    audience_role: audience === "role" ? role : null,
    audience_course_id: audience === "course" ? courseId : null,
    sent_by: user._id,
    recipient_count: delivered,
    link,
  });

  return {
    success: true,
    delivered,
    announcement_id: String(announcement._id),
  };
}

/**
 * Turns an audience into a list of user ids.
 *
 * A course audience means everyone that course touches: the pupils enrolled
 * on it, the parents of those pupils, and the instructor teaching it. A
 * parent who receives "tomorrow's class is cancelled" is the person who has
 * to act on it, so leaving them out would make the feature useless.
 */
async function resolveAudience({ audience, role, courseId }) {
  if (audience === "role") {
    if (!role) {
      throw badRequest("Validation failed", undefined, {
        target: "Choose a role to send to",
      });
    }
    const users = await User.find({ role, is_active: true }).select("_id");
    return users.map((u) => u._id);
  }

  if (audience === "course") {
    if (!courseId) {
      throw badRequest("Validation failed", undefined, {
        course_id: "Choose a course to send to",
      });
    }
    const course = await Course.findById(courseId);
    if (!course) throw notFound("Course not found");

    const enrolments = await Enrollment.find({
      course_id: course._id,
      status: { $in: ["active", "completed"] },
    }).select("student_id");

    const students = await Student.find({
      _id: { $in: enrolments.map((e) => e.student_id) },
    }).select("user_id parent_id");

    const ids = new Set();
    for (const student of students) {
      if (student.user_id) ids.add(String(student.user_id));
      if (student.parent_id) ids.add(String(student.parent_id));
    }
    if (course.instructor_id) ids.add(String(course.instructor_id));

    // Only to accounts that can still sign in.
    const active = await User.find({
      _id: { $in: [...ids] },
      is_active: true,
    }).select("_id");
    return active.map((u) => u._id);
  }

  const users = await User.find({ is_active: true }).select("_id");
  return users.map((u) => u._id);
}

/** How many notifications go in one insert. */
const FAN_OUT_BATCH = 500;

/**
 * Writes one notification per recipient, in batches.
 *
 * `insertMany` of several thousand documents is one enormous command that can
 * exceed the 16 MB limit and holds the event loop while it serialises. In
 * batches it is several ordinary writes, and a failure part-way leaves the
 * recipients already written notified rather than losing the lot.
 *
 * Each batch is pushed to any connected sockets as it lands, so the first
 * recipients see the bell move while the rest are still being written.
 */
async function fanOut({ recipientIds, type, title, message, link }) {
  if (recipientIds.length === 0) return 0;

  let delivered = 0;

  for (let i = 0; i < recipientIds.length; i += FAN_OUT_BATCH) {
    const slice = recipientIds.slice(i, i + FAN_OUT_BATCH);
    const rows = await Notification.insertMany(
      slice.map((id) => ({ user_id: id, type, title, message, link })),
      { ordered: false }
    );
    delivered += rows.length;

    for (const row of rows) {
      pushNotification({
        id: String(row._id),
        user_id: String(row.user_id),
        type: row.type,
        title: row.title,
        message: row.message,
        link: row.link ?? null,
        is_read: false,
        created_at: row.created_at?.toISOString() ?? null,
      });
    }
  }

  return delivered;
}

/**
 * Creates one notification and pushes it.
 *
 * The helper every other service uses, so "persist it and tell them" is one
 * call and cannot drift apart between callers.
 */
export async function notify({ userId, type, title, message, link = null }) {
  const row = await Notification.create({
    user_id: userId,
    type,
    title: asPlainText(title, 120) || "Notification",
    message: asPlainText(message, 1000),
    link,
  });

  pushNotification({
    id: String(row._id),
    user_id: String(row.user_id),
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link ?? null,
    is_read: false,
    created_at: row.created_at?.toISOString() ?? null,
  });

  return row;
}
