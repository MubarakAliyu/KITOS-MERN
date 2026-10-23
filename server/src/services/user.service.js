import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import { logActivity } from "../lib/audit.js";
import { toTrackLabel } from "../config/constants.js";

/**
 * The signed-in user's own profile (FR4).
 */

/**
 * Updates editable profile fields.
 *
 * Students may not change their own name: it is on their certificates and
 * their parent's dashboard, and a child renaming themselves mid-course would
 * break both. Staff and parents may. Nobody edits their own role, status or
 * admission number here — that is `PUT /admin/users/:id`.
 *
 * @param {{ user: import("mongoose").Document,
 *           patch: { name?: string, phone?: string, avatar_url?: string },
 *           ip?: string }} input
 */
export async function updateProfile({ user, patch, ip }) {
  const doc = await User.findById(user._id ?? user.id);

  const changed = [];

  if (patch.name !== undefined && user.role !== "student" && patch.name !== doc.name) {
    doc.name = patch.name;
    changed.push("name");
  }
  if (patch.phone !== undefined && patch.phone !== doc.phone) {
    doc.phone = patch.phone;
    changed.push("phone");
  }
  if (patch.avatar_url !== undefined && patch.avatar_url !== doc.avatar_url) {
    doc.avatar_url = patch.avatar_url;
    changed.push("avatar_url");
  }

  if (changed.length > 0) {
    await doc.save();
    await logActivity({
      actor: { id: doc._id, role: doc.role, name: doc.name },
      action: "profile_updated",
      description: `${doc.name} updated their profile (${changed.join(", ")})`,
      target_type: "user",
      target_id: String(doc._id),
      meta: { fields: changed },
      ip,
    });
  }

  // `{ ok: true, ...body }` is what the frontend's settings screen expects
  // back from PUT /user/profile.
  return {
    ok: true,
    name: doc.name,
    phone: doc.phone ?? null,
    avatar_url: doc.avatar_url ?? null,
  };
}

/**
 * Saves the UI language. The client keeps its own persisted copy; this is the
 * server-side record so the preference follows the user to another device.
 *
 * @param {{ user: object, language_preference: "en"|"ha" }} input
 */
export async function updateLanguage({ user, language_preference }) {
  await User.updateOne(
    { _id: user._id ?? user.id },
    { $set: { language_preference } }
  );
  return { success: true, language_preference };
}

/**
 * The signed-in user, in the shape the dashboards read.
 * Students get their learning profile folded in, as `/students/me` does.
 */
export async function getMe(user) {
  const base = user.toAuthJSON();

  if (user.role !== "student") {
    return {
      ...base,
      phone: user.phone ?? null,
      avatar_url: user.avatar_url ?? null,
      last_login_at: user.last_login_at?.toISOString() ?? null,
    };
  }

  const student = await Student.findOne({ user_id: user._id });

  return {
    ...base,
    student_id: student ? String(student._id) : null,
    age: student?.age ?? null,
    programme_track: toTrackLabel(student?.programme_track),
    status: student?.status ?? null,
  };
}
