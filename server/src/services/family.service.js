import mongoose from "mongoose";
import { User, hashPassword } from "../models/User.js";
import { Student } from "../models/Student.js";
import { Consent } from "../models/Consent.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { Notification } from "../models/Notification.js";
import { nextAdmissionNumber } from "../lib/numbering.js";
import { generateTempPassword } from "../lib/tokens.js";
import { logActivity } from "../lib/audit.js";
import { sendMail, childAccountEmail } from "../lib/mailer.js";
import { forbidden, notFound, badRequest } from "../lib/errors.js";
import { avatarInitial } from "../lib/serialize.js";
import {
  toTrackSlug,
  toTrackLabel,
  CONSENT_SCOPES,
} from "../config/constants.js";
import { studentProgressFeed } from "./course.service.js";
import { supportsTransactions } from "../config/db.js";

/**
 * Parents, children and consent (FR6), plus the student's own view.
 *
 * Ownership is enforced here, not in the route: the permission matrix says a
 * parent may manage children, and these functions say *which* children.
 */

/**
 * The parent's own profile, in the shape the parent dashboard reads
 * (handlers.js `PARENT_ME`).
 *
 * There is no `parents` collection — a parent is a User with role `parent`
 * (`_types/schema.js` says so explicitly) — so `id` and `user_id` are the same
 * value here, where the mock fixture had a separate `p1` (ADR-013).
 */
export function getParentProfile(user) {
  return {
    id: String(user._id),
    user_id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
  };
}

/**
 * The parent's children, oldest-added first so the dashboard's child switcher
 * keeps a stable order between visits.
 */
export async function listChildren(parentUser) {
  const students = await Student.find({ parent_id: parentUser._id }).sort({
    created_at: 1,
  });

  const userIds = students.map((s) => s.user_id);
  const accounts = await User.find({ _id: { $in: userIds } }).select(
    "admission_no is_active"
  );
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  const counts = await enrolmentCounts(students.map((s) => s._id));

  return students.map((student) => {
    const account = byId.get(String(student.user_id));
    return student.toParentJSON({
      admission_no: account?.admission_no ?? null,
      ...(counts.get(String(student._id)) ?? { enrolled_courses: 0, completed_courses: 0 }),
    });
  });
}

/**
 * How many courses each of these children is on, and how many they finished.
 *
 * One query for the whole family rather than two per child: a parent with
 * several children would otherwise fan out into a dozen round trips to draw
 * one screen.
 */
async function enrolmentCounts(studentIds) {
  const rows = await Enrollment.find({
    student_id: { $in: studentIds },
    status: { $in: ["active", "completed"] },
  }).select("student_id status");

  const counts = new Map();
  for (const row of rows) {
    const key = String(row.student_id);
    const tally = counts.get(key) ?? { enrolled_courses: 0, completed_courses: 0 };
    tally.enrolled_courses += 1;
    if (row.status === "completed") tally.completed_courses += 1;
    counts.set(key, tally);
  }
  return counts;
}

/**
 * A parent adds a child, with consent (FR6).
 *
 * Creates three records that only make sense together — the sign-in identity,
 * the learning profile and the consent evidence — so they go in one
 * transaction where the deployment supports one (Atlas and the in-memory
 * replica set do). If any step fails, none of them is left behind: a student
 * with no consent row would be unable to sign in with no way to fix it, and a
 * consent row pointing at a missing student is unusable evidence.
 *
 * The one-time password is returned **once** for the parent to note. The
 * account is active immediately because consent is recorded in the same
 * breath; a child added without `consent.accepted` stays `pending` and cannot
 * sign in.
 *
 * @param {{ parent: object, payload: object, ip?: string, userAgent?: string }} input
 */
export async function addChild({ parent, payload, ip, userAgent }) {
  const track = toTrackSlug(payload.programme_track);
  if (!track) {
    throw badRequest("Validation failed", undefined, {
      programme_track: "Choose one of the programme tracks",
    });
  }

  const accepted = payload.consent?.accepted === true;
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;

  let user;
  let student;
  let consent = null;
  let admissionNo;

  const work = async () => {
    const opts = session ? { session } : {};

    admissionNo = await nextAdmissionNumber(session ? { session } : {});

    [user] = await User.create(
      [
        {
          role: "student",
          name: payload.name,
          admission_no: admissionNo,
          password_hash: passwordHash,
          language_preference: parent.language_preference ?? "en",
          // The child chooses their own password on first sign-in.
          must_reset_password: true,
          is_active: true,
        },
      ],
      opts
    );

    [student] = await Student.create(
      [
        {
          user_id: user._id,
          parent_id: parent._id,
          name: payload.name,
          age: payload.age,
          programme_track: track,
          // No consent, no sign-in (PRD §10, "Consent").
          status: accepted ? "active" : "pending",
        },
      ],
      opts
    );

    if (accepted) {
      [consent] = await Consent.create(
        [
          {
            parent_id: parent._id,
            student_id: student._id,
            version: payload.consent.version,
            scopes: payload.consent.scopes ?? [...CONSENT_SCOPES],
            accepted_at: new Date(),
            ip: ip ?? null,
            user_agent: userAgent ?? null,
          },
        ],
        opts
      );

      student.consent_id = consent._id;
      await student.save(opts);
    }
  };

  try {
    if (session) {
      await session.withTransaction(work);
    } else {
      await work();
    }
  } finally {
    await session?.endSession();
  }

  // Notifications and email sit outside the transaction: they are not part of
  // the record, and a mail failure must not roll back a created child.
  const admins = await User.find({ role: "admin", is_active: true }).select("_id");
  if (admins.length > 0) {
    await Notification.insertMany(
      admins.map((admin) => ({
        user_id: admin._id,
        type: "child_added",
        title: "New child added",
        message: `${parent.name} added ${student.name} (${toTrackLabel(track)}), admission number ${admissionNo}.`,
        link: "/admin/users",
      }))
    );
  }

  if (parent.email) {
    const message = childAccountEmail({
      parentName: parent.name,
      childName: student.name,
      admissionNo,
      tempPassword,
    });
    await sendMail({ to: parent.email, ...message });
  }

  await logActivity({
    actor: { id: parent._id, role: parent.role, name: parent.name },
    action: "added_child",
    description: `${parent.name} added ${student.name} and accepted the consent notice`,
    target_type: "student",
    target_id: String(student._id),
    meta: {
      admission_no: admissionNo,
      consent_version: payload.consent?.version ?? null,
      consent_accepted: accepted,
    },
    ip,
  });

  return {
    ...student.toParentJSON({ admission_no: admissionNo }),
    // Shown once, for the parent to write down. Never stored in plain text.
    admission_no: admissionNo,
    password: tempPassword,
    consent_id: consent ? String(consent._id) : null,
  };
}

/**
 * The student's own profile, in the shape `/students/me` returns
 * (handlers.js `STUDENT_ME`) — note `id` is the **student** document id, which
 * is what `/students/:id/progress` is keyed on.
 */
export async function getStudentProfile(user) {
  const student = await Student.findOne({ user_id: user._id });
  if (!student) {
    throw notFound(
      "Student profile not found",
      "This account has no learning profile — contact an administrator"
    );
  }

  return {
    id: String(student._id),
    parent_id: String(student.parent_id),
    name: student.name,
    age: student.age,
    programme_track: toTrackLabel(student.programme_track),
    admission_no: user.admission_no ?? null,
    email: user.email ?? null,
    status: student.status,
  };
}

/**
 * Per-course progress for one student.
 *
 * Ownership (PRD §9.2): a parent may read their own child, a student their own
 * record, an admin anyone, and an instructor only a child enrolled on one of
 * their own courses — the narrowing ADR-014 deferred to this batch, now that
 * there are enrolments to narrow by. A teacher of the robotics class has no
 * business reading the progress of a child they have never taught.
 */
export async function getStudentProgress({ studentId, requester }) {
  const student = await Student.findById(studentId);
  if (!student) throw notFound("Student not found");

  const requesterId = String(requester._id);

  let allowed =
    requester.role === "admin" ||
    (requester.role === "parent" && String(student.parent_id) === requesterId) ||
    (requester.role === "student" && String(student.user_id) === requesterId);

  if (!allowed && requester.role === "instructor") {
    const theirCourses = await Course.find({ instructor_id: requester._id }).select("_id");
    allowed = await Enrollment.exists({
      student_id: student._id,
      course_id: { $in: theirCourses.map((c) => c._id) },
      status: { $in: ["active", "completed"] },
    });
  }

  if (!allowed) {
    throw forbidden(
      "You do not have permission to view this student",
      "A parent may only view their own children"
    );
  }

  return studentProgressFeed(student._id);
}

/**
 * The instructor's own profile (handlers.js `INSTRUCTOR_ME`).
 *
 * As with parents there is no `instructors` collection, so `id` and `user_id`
 * are the same value (ADR-013).
 */
export async function getInstructorProfile(user) {
  const courses = await Course.find({ instructor_id: user._id }).select("_id");
  const courseIds = courses.map((c) => c._id);

  // Distinct children: one pupil on three of their courses is one pupil.
  const studentIds = await Enrollment.find({
    course_id: { $in: courseIds },
    status: { $in: ["active", "completed"] },
  }).distinct("student_id");

  return {
    id: String(user._id),
    user_id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    bio: user.bio ?? null,
    avatar_initial: avatarInitial(user.name),
    courses_count: courses.length,
    students_count: studentIds.length,
    joined: user.created_at?.toISOString().slice(0, 10) ?? null,
  };
}
