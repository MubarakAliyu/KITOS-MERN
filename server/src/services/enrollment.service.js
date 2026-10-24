import mongoose from "mongoose";
import { Enrollment } from "../models/Enrollment.js";
import { Lesson } from "../models/Lesson.js";
import { LessonCompletion } from "../models/LessonCompletion.js";
import { Certificate } from "../models/Certificate.js";
import { Course } from "../models/Course.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { QuizAttempt } from "../models/QuizAttempt.js";
import { Notification } from "../models/Notification.js";
import { notFound, forbidden, conflict, badRequest } from "../lib/errors.js";
import { nextCertificateSerial, generateVerificationCode } from "../lib/numbering.js";
import { recalculateProgress, progressBreakdown } from "./progress.service.js";
import { supportsTransactions } from "../config/db.js";
import { logger } from "../lib/logger.js";

/**
 * Enrolment, lesson completion and certificates (FR10, FR11).
 */

async function studentOrFail(user) {
  const student = await Student.findOne({ user_id: user._id });
  if (!student) {
    throw notFound(
      "Student profile not found",
      "This account has no learning profile — contact an administrator"
    );
  }
  return student;
}

/**
 * Enrols a student on a course.
 *
 * Idempotent: enrolling twice reactivates a cancelled enrolment rather than
 * failing or duplicating, which is what an administrator clicking twice
 * means. `source` records who caused it — an admin, a payment (Batch 3), or
 * the seed.
 */
export async function enrol({ studentId, courseId, source = "admin", session }) {
  const course = await Course.findById(courseId).session(session ?? null);
  if (!course) throw notFound("Course not found");

  const student = await Student.findById(studentId).session(session ?? null);
  if (!student) throw notFound("Student not found");

  const existing = await Enrollment.findOne({
    student_id: studentId,
    course_id: courseId,
  }).session(session ?? null);

  if (existing) {
    if (existing.status === "cancelled") {
      existing.status = "active";
      await existing.save({ session });
    }
    return existing;
  }

  const [created] = await Enrollment.create(
    [
      {
        student_id: studentId,
        course_id: courseId,
        status: "active",
        source,
        progress: 0,
      },
    ],
    session ? { session } : {}
  );

  // A fresh enrolment starts from whatever the student has already done on
  // this course — unusual, but possible if they were unenrolled and put back.
  if (!session) {
    await recalculateProgress({ studentId, courseId });
  }

  return created;
}

/** Cancels an enrolment without destroying the work behind it. */
export async function unenrol({ studentId, courseId }) {
  const enrollment = await Enrollment.findOne({
    student_id: studentId,
    course_id: courseId,
  });
  if (!enrollment) throw notFound("Enrolment not found");

  enrollment.status = "cancelled";
  await enrollment.save();
  return { success: true };
}

/**
 * `POST /lessons/:id/complete` (FR10).
 *
 * The unique index on (student, lesson) makes this idempotent: pressing the
 * button twice cannot inflate progress. Reaching 100% issues a certificate,
 * in the same call, so a child never finishes a course and sees nothing.
 */
export async function completeLesson({ user, lessonId }) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw notFound("Lesson not found");

  const student = await studentOrFail(user);

  const enrollment = await Enrollment.findOne({
    student_id: student._id,
    course_id: lesson.course_id,
    status: { $in: ["active", "completed"] },
  });
  if (!enrollment) {
    throw forbidden(
      "You are not enrolled on this course",
      "Ask an administrator to enrol you before continuing"
    );
  }

  await LessonCompletion.findOneAndUpdate(
    { student_id: student._id, lesson_id: lesson._id },
    {
      $setOnInsert: {
        student_id: student._id,
        lesson_id: lesson._id,
        course_id: lesson.course_id,
        completed_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const { justCompleted, breakdown } = await recalculateProgress({
    studentId: student._id,
    courseId: lesson.course_id,
    touchActivity: true,
  });

  let certificate = null;
  if (justCompleted) {
    certificate = await issueCertificate({
      studentId: student._id,
      courseId: lesson.course_id,
    });
  }

  return {
    success: true,
    progress: breakdown?.percentage ?? 0,
    course_completed: justCompleted,
    certificate: certificate ? serializeCertificate(certificate) : null,
  };
}

/**
 * Issues a certificate, once (FR11).
 *
 * Idempotent by the unique index on (student, course): a retry, a double
 * click, or two requests racing to finish the last lesson all end with one
 * certificate. The duplicate-key error is caught and the existing row
 * returned rather than surfaced — from the caller's point of view the
 * certificate exists either way, which is what they asked for.
 *
 * Name and course title are snapshotted so a later rename cannot rewrite a
 * certificate already in a family's hands.
 */
export async function issueCertificate({ studentId, courseId }) {
  const existing = await Certificate.findOne({
    student_id: studentId,
    course_id: courseId,
  });
  if (existing) return existing;

  const [student, course] = await Promise.all([
    Student.findById(studentId),
    Course.findById(courseId),
  ]);
  if (!student || !course) throw notFound("Student or course not found");

  const instructor = course.instructor_id
    ? await User.findById(course.instructor_id).select("name")
    : null;

  // The average of their best quiz scores, where they sat any.
  const attempts = await QuizAttempt.find({
    student_id: studentId,
    course_id: courseId,
  }).select("percentage");
  const scoreAverage =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length
        )
      : null;

  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;

  let certificate;

  const work = async () => {
    const opts = session ? { session } : {};
    const serial = await nextCertificateSerial(session ? { session } : {});

    [certificate] = await Certificate.create(
      [
        {
          student_id: studentId,
          course_id: courseId,
          serial,
          verification_code: generateVerificationCode(),
          issued_at: new Date(),
          student_name: student.name,
          course_title: course.title,
          instructor_name: instructor?.name ?? null,
          score_average: scoreAverage,
        },
      ],
      opts
    );

    await Enrollment.updateOne(
      { student_id: studentId, course_id: courseId },
      { $set: { status: "completed", completed_at: new Date() } },
      opts
    );
  };

  try {
    if (session) await session.withTransaction(work);
    else await work();
  } catch (err) {
    // Another request got there first. That is the correct outcome.
    if (err?.code === 11000) {
      const raced = await Certificate.findOne({
        student_id: studentId,
        course_id: courseId,
      });
      if (raced) return raced;
    }
    throw err;
  } finally {
    await session?.endSession();
  }

  // Tell the pupil and their parent. Outside the transaction: a notification
  // failure must not undo a certificate.
  const recipients = [student.user_id, student.parent_id].filter(Boolean);
  await Notification.insertMany(
    recipients.map((userId) => ({
      user_id: userId,
      type: "course_complete",
      title: "Certificate earned",
      message: `${student.name} has completed ${course.title}. Certificate ${certificate.serial} is ready.`,
      link: "/student/certificates",
    }))
  );

  logger.info(
    { serial: certificate.serial, course: course.title },
    "Issued certificate"
  );

  return certificate;
}

export function serializeCertificate(certificate, extra = {}) {
  return {
    id: String(certificate._id),
    student_id: String(certificate.student_id),
    course_id: String(certificate.course_id),
    student_name: certificate.student_name,
    course_title: certificate.course_title,
    instructor_name: certificate.instructor_name ?? null,
    serial: certificate.serial,
    verification_code: certificate.verification_code,
    issued_at: certificate.issued_at?.toISOString() ?? null,
    completion_date: certificate.issued_at?.toISOString() ?? null,
    score_average: certificate.score_average ?? null,
    pdf_url: `/certificates/${certificate._id}/pdf`,
    is_unlocked: true,
    ...extra,
  };
}

/**
 * `GET /certificates`.
 *
 * A student sees their own; a parent sees their children's. The screen shows
 * locked cards too — courses in progress — so an enrolment without a
 * certificate is returned with `is_unlocked: false` and its progress, which
 * is what the certificates page renders as "keep going".
 */
export async function listCertificates(user) {
  let studentIds = [];

  if (user.role === "student") {
    const student = await studentOrFail(user);
    studentIds = [student._id];
  } else if (user.role === "parent") {
    const children = await Student.find({ parent_id: user._id }).select("_id");
    studentIds = children.map((c) => c._id);
  } else {
    // Staff: everything, for support and the admin view.
    const all = await Student.find({}).select("_id");
    studentIds = all.map((s) => s._id);
  }

  if (studentIds.length === 0) return [];

  const [certificates, enrollments] = await Promise.all([
    Certificate.find({ student_id: { $in: studentIds } }).sort({ issued_at: -1 }),
    Enrollment.find({
      student_id: { $in: studentIds },
      status: { $in: ["active", "completed"] },
    }),
  ]);

  const certified = new Set(
    certificates.map((c) => `${c.student_id}:${c.course_id}`)
  );

  const courses = await Course.find({
    _id: { $in: enrollments.map((e) => e.course_id) },
  }).select("title");
  const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));

  const students = await Student.find({ _id: { $in: studentIds } }).select("name");
  const studentName = new Map(students.map((s) => [String(s._id), s.name]));

  const unlocked = certificates.map((certificate) =>
    serializeCertificate(certificate)
  );

  const locked = [];
  for (const enrollment of enrollments) {
    const key = `${enrollment.student_id}:${enrollment.course_id}`;
    if (certified.has(key)) continue;

    const breakdown = await progressBreakdown(
      enrollment.student_id,
      enrollment.course_id
    );

    locked.push({
      id: `locked-${enrollment._id}`,
      student_id: String(enrollment.student_id),
      course_id: String(enrollment.course_id),
      student_name: studentName.get(String(enrollment.student_id)) ?? null,
      course_title: courseTitle.get(String(enrollment.course_id)) ?? null,
      is_unlocked: false,
      progress: enrollment.progress,
      modules_progress: {
        completed: breakdown.lessons.completed,
        total: breakdown.lessons.total,
      },
      quizzes_progress: {
        completed: breakdown.quizzes.completed,
        total: breakdown.quizzes.total,
      },
      assignments_progress: {
        completed: breakdown.assignments.completed,
        total: breakdown.assignments.total,
      },
    });
  }

  return [...unlocked, ...locked];
}

/** The certificate behind `GET /certificates/:id/pdf`, with an access check. */
export async function getCertificateForUser({ user, certificateId }) {
  const certificate = await Certificate.findById(certificateId);
  if (!certificate) throw notFound("Certificate not found");

  if (user.role === "admin" || user.role === "instructor") return certificate;

  const student = await Student.findById(certificate.student_id);
  if (!student) throw notFound("Certificate not found");

  const allowed =
    (user.role === "student" && String(student.user_id) === String(user._id)) ||
    (user.role === "parent" && String(student.parent_id) === String(user._id));

  if (!allowed) {
    throw forbidden("You do not have permission to view this certificate");
  }

  return certificate;
}

/**
 * `GET /certificates/verify/:code` — public (FR11).
 *
 * Deliberately sparse. Anyone with the code can confirm a certificate is
 * genuine, so it must not become a way to look up a child: initials rather
 * than a full name, the course and the date, and nothing else. No student id,
 * no parent, no school.
 */
export async function verifyCertificate(code) {
  const certificate = await Certificate.findOne({
    verification_code: String(code ?? "").trim().toUpperCase(),
  });

  if (!certificate) {
    return { valid: false, reason: "No certificate matches that code" };
  }

  const initials = String(certificate.student_name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join(".");

  return {
    valid: true,
    student_initials: initials ? `${initials}.` : null,
    course_title: certificate.course_title,
    issued_at: certificate.issued_at?.toISOString() ?? null,
    serial: certificate.serial,
    issued_by: "StarNova Labs",
  };
}

/** Admin: enrol a student, used by the user detail screen. */
export async function adminEnrol({ studentId, courseId }) {
  if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(courseId)) {
    throw badRequest("Validation failed", undefined, {
      student_id: "Must be a valid id",
    });
  }

  const existing = await Enrollment.findOne({
    student_id: studentId,
    course_id: courseId,
    status: { $in: ["active", "completed"] },
  });
  if (existing) {
    throw conflict("That student is already enrolled on this course");
  }

  const enrollment = await enrol({ studentId, courseId, source: "admin" });
  return {
    success: true,
    id: String(enrollment._id),
    status: enrollment.status,
  };
}
