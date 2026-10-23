import sanitizeHtml from "sanitize-html";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { notFound, forbidden } from "../lib/errors.js";
import { can } from "../config/permissions.js";

/**
 * Notifications.
 *
 * The batch brief puts notification *routes* in Batch 3, but the model and
 * real rows already exist in Batch 1 — a parent adding a child notifies every
 * administrator — and AC1.1 requires the dashboards to load with no console
 * errors, which a 404 on the bell feed would break. So the read side and
 * mark-as-read are implemented here (ADR-019). Batch 3 adds the Announcement
 * model, audience targeting by course and the Socket.IO push.
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
 * Sends a notification.
 *
 * Two quite different callers share this endpoint in the frontend:
 *   - `adminNotify.js` fires platform events ("a student signed in", "a
 *     payment arrived") from any signed-in user's browser;
 *   - the admin Announcement modal broadcasts to an audience.
 *
 * So a non-admin may only notify administrators, whatever they ask for. If
 * any user could choose the audience, a student could spam every parent on
 * the platform. Audience targeting is admin-only, and course-scoped audiences
 * wait for enrollments in Batch 2.
 */
export async function sendNotification({ user, payload }) {
  const isAdmin = can(user.role, "settings.manage");

  const title = asPlainText(payload.title, 120) || "Notification";
  const message = asPlainText(payload.message, 1000);
  const link = payload.link ? asPlainText(payload.link, 300) : null;
  const type = asPlainText(payload.type, 60) || "system";

  let recipients;

  if (!isAdmin) {
    // Platform event from a normal user: administrators only.
    recipients = await User.find({ role: "admin", is_active: true }).select("_id");
  } else {
    const audience = payload.audience ?? "all";
    const filter = { is_active: true };

    if (audience === "role" && payload.target) {
      filter.role = payload.target;
    } else if (audience === "course") {
      // Needs the enrollments collection (Batch 2); until then this would
      // silently reach nobody, which is worse than saying so.
      throw forbidden(
        "Course audiences are not available yet",
        "Enrolments arrive in Batch 2 — choose 'all' or a role for now"
      );
    }

    recipients = await User.find(filter).select("_id");
  }

  if (recipients.length === 0) return { success: true, delivered: 0 };

  await Notification.insertMany(
    recipients.map((recipient) => ({
      user_id: recipient._id,
      type,
      title,
      message,
      link,
    }))
  );

  return { success: true, delivered: recipients.length };
}
