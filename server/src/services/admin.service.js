import mongoose from "mongoose";
import { User, hashPassword } from "../models/User.js";
import { Student } from "../models/Student.js";
import { Consent } from "../models/Consent.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import {
  nextAdmissionNumber,
  peekAdmissionNumber,
} from "../lib/numbering.js";
import { generateTempPassword } from "../lib/tokens.js";
import { logActivity } from "../lib/audit.js";
import { sendMail, childAccountEmail } from "../lib/mailer.js";
import { searchRegex, toSkipLimit } from "../lib/pagination.js";
import { badRequest, notFound, conflict } from "../lib/errors.js";
import { toTrackSlug, toTrackLabel } from "../config/constants.js";

/**
 * Administrative user management (FR5). Every mutation here writes an audit
 * row — that is a requirement, not a nicety (PRD §10, "Audit").
 */

/**
 * The admin users list.
 *
 * Returns a bare array, because that is what the retained users table
 * consumes (`getAdminUsers()` in `_lib/api/admin.js` hands `r.data` straight
 * to the table) — see ADR-010. Filters and pagination are honoured so a large
 * deployment is not forced to send every row.
 *
 * @param {{ role?: string, status?: string, q?: string, page?: number,
 *           limit?: number }} [query]
 */
export async function listUsers(query = {}) {
  const filter = {};

  if (query.role) filter.role = query.role;
  if (query.status) filter.is_active = query.status === "active";

  if (query.q) {
    const rx = searchRegex(query.q);
    filter.$or = [{ name: rx }, { email: rx }, { admission_no: rx }];
  }

  const { skip, limit } = toSkipLimit(query);

  const users = await User.find(filter)
    .sort({ created_at: 1 })
    .skip(skip)
    .limit(limit);

  // Students carry age and programme track in the table.
  const studentIds = users.filter((u) => u.role === "student").map((u) => u._id);
  const students = studentIds.length
    ? await Student.find({ user_id: { $in: studentIds } })
    : [];
  const byUserId = new Map(students.map((s) => [String(s.user_id), s]));

  return users.map((user) => {
    const student = byUserId.get(String(user._id));
    return user.toAdminJSON(
      student
        ? {
            age: student.age,
            programme_track: toTrackLabel(student.programme_track),
            student_id: String(student._id),
            // Enrolment counts arrive with the enrollments collection in
            // Batch 2; the table renders 0 until then.
            enrolled_courses: [],
          }
        : { enrolled_courses: [] }
    );
  });
}

/** A single user, for the admin detail modal. */
export async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw notFound("User not found");

  if (user.role !== "student") return user.toAdminJSON({ enrolled_courses: [] });

  const student = await Student.findOne({ user_id: user._id });
  return user.toAdminJSON({
    age: student?.age ?? null,
    programme_track: toTrackLabel(student?.programme_track),
    student_id: student ? String(student._id) : null,
    enrolled_courses: [],
  });
}

/**
 * Creates a user of any role.
 *
 * Students get an atomically generated admission number, a `Student` profile
 * and `must_reset_password: true`; the one-time password is returned **once**,
 * in this response, for the administrator to pass on. It is never stored in
 * plain text and never logged.
 *
 * A student created by an administrator is `active` immediately when the
 * parent's consent is already on record, and `pending` otherwise — the same
 * consent rule a parent-created child follows, applied from the other
 * direction.
 *
 * @param {object} input
 * @param {object} actor The administrator performing this.
 * @param {string} [ip]
 */
export async function createUser(input, actor, ip) {
  const role = input.role ?? "student";
  const isStudent = role === "student";

  if (input.email) {
    const existing = await User.findOne({ email: input.email.toLowerCase() })
      .collation({ locale: "en", strength: 2 })
      .select("_id");
    if (existing) {
      throw conflict("That email address is already registered", undefined);
    }
  }

  if (!isStudent && !input.email) {
    throw badRequest("Validation failed", undefined, {
      email: "An email address is required for this role",
    });
  }

  let parent = null;
  if (isStudent) {
    if (!input.parent_id) {
      throw badRequest("Validation failed", undefined, {
        parent_id: "A student must be linked to a parent",
      });
    }
    parent = await User.findOne({ _id: input.parent_id, role: "parent" });
    if (!parent) {
      throw badRequest("Validation failed", undefined, {
        parent_id: "No parent account found with that id",
      });
    }
    if (!input.programme_track) {
      throw badRequest("Validation failed", undefined, {
        programme_track: "A programme track is required for a student",
      });
    }
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const admissionNo = isStudent ? await nextAdmissionNumber() : undefined;

  const user = await User.create({
    role,
    name: input.name,
    email: input.email ? input.email.toLowerCase() : undefined,
    admission_no: admissionNo,
    password_hash: passwordHash,
    language_preference: input.language_preference ?? "en",
    must_reset_password: true,
    is_active: true,
  });

  let student = null;
  if (isStudent) {
    // An administrator provisioning a child the parent already consented to
    // must not re-gate the account behind consent that exists.
    const priorConsent = await Consent.findOne({ parent_id: parent._id })
      .sort({ accepted_at: -1 })
      .select("_id");

    student = await Student.create({
      user_id: user._id,
      parent_id: parent._id,
      name: input.name,
      age: input.age,
      programme_track: toTrackSlug(input.programme_track),
      status: priorConsent ? "active" : "pending",
      consent_id: priorConsent?._id ?? null,
    });

    if (parent.email) {
      const message = childAccountEmail({
        parentName: parent.name,
        childName: user.name,
        admissionNo,
        tempPassword,
      });
      await sendMail({ to: parent.email, ...message });
    }

    await Notification.create({
      user_id: parent._id,
      type: "account_created",
      title: "Child Account Created",
      message:
        `Login details have been created for ${user.name}. ` +
        `Admission Number: ${admissionNo}. ` +
        "They will be prompted to set a new password on first login.",
      link: "/parent/children",
    });
  }

  await logActivity({
    actor,
    action: "created_user",
    description: `Created ${role} account for ${user.name}`,
    target_type: "user",
    target_id: String(user._id),
    meta: { role, admission_no: admissionNo ?? null },
    ip,
  });

  return {
    ...user.toAdminJSON(
      student
        ? {
            age: student.age,
            programme_track: toTrackLabel(student.programme_track),
            student_id: String(student._id),
          }
        : {}
    ),
    // Shown once so the administrator can pass it on. Not stored, not logged.
    password: tempPassword,
  };
}

/**
 * Updates a user. Role changes are refused: a parent carrying children or a
 * student carrying progress cannot coherently become something else, and
 * allowing it would be a quiet way to grant admin rights.
 */
export async function updateUser(id, patch, actor, ip) {
  const user = await User.findById(id);
  if (!user) throw notFound("User not found");

  if (patch.role && patch.role !== user.role) {
    throw badRequest(
      "A user's role cannot be changed",
      "Deactivate this account and create a new one with the required role"
    );
  }

  const changed = [];

  if (patch.name !== undefined && patch.name !== user.name) {
    user.name = patch.name;
    changed.push("name");
  }

  if (patch.email !== undefined) {
    const email = patch.email ? patch.email.toLowerCase() : undefined;
    if (email !== user.email) {
      if (email) {
        const clash = await User.findOne({ email, _id: { $ne: user._id } })
          .collation({ locale: "en", strength: 2 })
          .select("_id");
        if (clash) throw conflict("That email address is already registered");
      }
      user.email = email;
      changed.push("email");
    }
  }

  if (
    patch.language_preference !== undefined &&
    patch.language_preference !== user.language_preference
  ) {
    user.language_preference = patch.language_preference;
    changed.push("language_preference");
  }

  if (patch.phone !== undefined && patch.phone !== user.phone) {
    user.phone = patch.phone;
    changed.push("phone");
  }

  await user.save();

  // Age and track live on the student profile, not the user.
  if (user.role === "student" && (patch.age !== undefined || patch.programme_track)) {
    const student = await Student.findOne({ user_id: user._id });
    if (student) {
      if (patch.age !== undefined) {
        student.age = patch.age;
        changed.push("age");
      }
      if (patch.programme_track) {
        student.programme_track = toTrackSlug(patch.programme_track);
        changed.push("programme_track");
      }
      if (patch.name !== undefined) student.name = patch.name;
      await student.save();
    }
  }

  await logActivity({
    actor,
    action: "updated_user",
    description:
      changed.length > 0
        ? `Updated ${user.name} (${changed.join(", ")})`
        : `Saved ${user.name} with no changes`,
    target_type: "user",
    target_id: String(user._id),
    meta: { fields: changed },
    ip,
  });

  return getUser(user._id);
}

/**
 * Activates or deactivates an account.
 *
 * Deactivation increments `token_version`, so the user's existing session is
 * rejected on their very next request rather than surviving until the token
 * expires (AC1.3).
 *
 * @param {"activate"|"deactivate"} action
 */
export async function setUserActive(id, action, actor, ip) {
  const user = await User.findById(id).select("+token_version");
  if (!user) throw notFound("User not found");

  const activating = action === "activate";

  // An administrator locking themselves out mid-session is a support call we
  // can simply prevent.
  if (!activating && String(user._id) === String(actor?.id ?? actor?._id)) {
    throw badRequest(
      "You cannot deactivate your own account",
      "Ask another administrator to do this"
    );
  }

  user.is_active = activating;
  if (!activating) user.revokeTokens();
  await user.save();

  await logActivity({
    actor,
    action: activating ? "activated_user" : "deactivated_user",
    description: `${activating ? "Activated" : "Deactivated"} ${user.role} account: ${user.name}`,
    target_type: "user",
    target_id: String(user._id),
    ip,
  });

  return {
    success: true,
    message: activating ? "User activated" : "User deactivated",
    user: user.toAdminJSON(),
  };
}

/**
 * Assigns an instructor to a course.
 *
 * Courses arrive in Batch 2, so there is nothing to write the assignment onto
 * yet. Rather than fail the screen or pretend, this validates that the
 * instructor exists and is active, records the intent in the audit log, and
 * returns the `{ success: true }` the modal expects. Batch 2 replaces the
 * recording step with a write to `courses.instructor_id` (ADR-012).
 */
export async function assignInstructor({ user_id, course_id }, actor, ip) {
  const instructor = await User.findOne({ _id: user_id, role: "instructor" });
  if (!instructor) {
    throw badRequest("Validation failed", undefined, {
      user_id: "No instructor account found with that id",
    });
  }
  if (!instructor.is_active) {
    throw badRequest(
      "That instructor's account is deactivated",
      "Reactivate the account before assigning courses to it"
    );
  }

  await logActivity({
    actor,
    action: "assigned_instructor",
    description: `Recorded assignment of ${instructor.name} to course ${course_id ?? "(unspecified)"}`,
    target_type: "user",
    target_id: String(instructor._id),
    meta: {
      course_id: course_id ?? null,
      // Flags this as intent only, so Batch 2 can find and reconcile these.
      pending_until_batch: 2,
    },
    ip,
  });

  return { success: true };
}

/** `GET /admin/next-admission-no` — a preview that reserves nothing. */
export async function nextAdmissionNoPreview() {
  return { next: await peekAdmissionNumber() };
}

/**
 * The activity log, newest first, in the shape the admin screen reads.
 */
export async function listActivityLog(query = {}) {
  const { skip, limit } = toSkipLimit({
    page: query.page ?? 1,
    limit: query.limit ?? 50,
  });

  const rows = await ActivityLog.find({})
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);

  return rows.map((row) => row.toAdminJSON());
}

/**
 * Children a parent has added who have no sign-in account yet, for the admin
 * "pending enrolments" screen. A child created through `POST /students` by a
 * parent already has a user account, so what shows here are students still
 * waiting on consent.
 */
export async function listPendingEnrollments() {
  const students = await Student.find({ status: "pending" })
    .sort({ created_at: -1 })
    .populate("parent_id", "name email");

  return students.map((student) => ({
    id: String(student._id),
    parent_id: String(student.parent_id?._id ?? student.parent_id),
    parent_name: student.parent_id?.name ?? null,
    parent_email: student.parent_id?.email ?? null,
    child_name: student.name,
    age: student.age,
    programme_track: toTrackLabel(student.programme_track),
    status: "pending_enrollment",
    requested_at: student.created_at?.toISOString() ?? null,
  }));
}

/**
 * Platform counts for the admin dashboard tiles.
 *
 * Revenue and subscriptions come from the payments collection in Batch 3; they
 * are 0 here so the tiles render their zero state rather than crash.
 */
export async function getStats() {
  const [students, instructors] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "instructor" }),
  ]);

  return {
    total_students: students,
    total_instructors: instructors,
    total_courses: 0,
    total_revenue: 0,
    active_subscriptions: 0,
    students_change: 0,
    revenue_change: 0,
    courses_change: 0,
    instructors_change: 0,
  };
}

/** True when the id is a well-formed ObjectId, for guard clauses. */
export function isValidId(id) {
  return mongoose.isValidObjectId(id);
}
