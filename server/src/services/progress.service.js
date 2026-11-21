import mongoose from "mongoose";
import { Lesson } from "../models/Lesson.js";
import { Quiz } from "../models/Quiz.js";
import { Assignment } from "../models/Assignment.js";
import { LessonCompletion } from "../models/LessonCompletion.js";
import { QuizAttempt } from "../models/QuizAttempt.js";
import { Submission } from "../models/Submission.js";
import { Enrollment } from "../models/Enrollment.js";
import { logger } from "../lib/logger.js";
import { PROGRESS_WEIGHTS, QUIZ_PASS_PERCENTAGE } from "../config/constants.js";

/**
 * Course progress (FR10).
 *
 * One service owns the rule, so "what counts as done" is defined exactly
 * once. Everything that can change a percentage calls in here: completing a
 * lesson, passing a quiz, submitting an assignment, and — easy to forget —
 * an instructor *adding* a lesson, which lowers everyone's progress on that
 * course.
 *
 * The rule: every lesson, quiz and assignment on the course is an item.
 * A lesson counts when completed, a quiz when the best score reaches the pass
 * mark, an assignment when submitted. The weights live in one constant so
 * they can be retuned without hunting through queries.
 *
 * The legacy API counted a quiz as done merely for having been *attempted*,
 * so a child could score 10% and still reach 100% on the course and collect a
 * certificate. Requiring a pass is a deliberate change.
 */

/**
 * The totals and completions behind a student's progress on one course.
 * Exported so the dashboards can show "3 of 5 modules" without recomputing.
 *
 * @param {string} studentId
 * @param {string} courseId
 */
export async function progressBreakdown(studentId, courseId) {
  const [
    totalLessons,
    totalQuizzes,
    totalAssignments,
    completedLessons,
    passedQuizzes,
    submittedAssignments,
  ] = await Promise.all([
    Lesson.countDocuments({ course_id: courseId }),
    Quiz.countDocuments({ course_id: courseId }),
    Assignment.countDocuments({ course_id: courseId }),
    LessonCompletion.countDocuments({ student_id: studentId, course_id: courseId }),
    QuizAttempt.countDocuments({
      student_id: studentId,
      course_id: courseId,
      percentage: { $gte: QUIZ_PASS_PERCENTAGE },
    }),
    Submission.countDocuments({ student_id: studentId, course_id: courseId }),
  ]);

  const weighted =
    totalLessons * PROGRESS_WEIGHTS.lesson +
    totalQuizzes * PROGRESS_WEIGHTS.quiz +
    totalAssignments * PROGRESS_WEIGHTS.assignment;

  const earned =
    Math.min(completedLessons, totalLessons) * PROGRESS_WEIGHTS.lesson +
    Math.min(passedQuizzes, totalQuizzes) * PROGRESS_WEIGHTS.quiz +
    Math.min(submittedAssignments, totalAssignments) * PROGRESS_WEIGHTS.assignment;

  // A course with no content at all is not "100% complete" — it is empty, and
  // calling that finished would issue certificates for nothing.
  const percentage = weighted > 0 ? Math.round((earned / weighted) * 100) : 0;

  return {
    lessons: { total: totalLessons, completed: completedLessons },
    quizzes: { total: totalQuizzes, completed: passedQuizzes },
    assignments: { total: totalAssignments, completed: submittedAssignments },
    percentage: Math.max(0, Math.min(100, percentage)),
    has_content: weighted > 0,
  };
}

/**
 * Recalculates and stores one student's progress on one course.
 *
 * Returns the enrolment and whether it has just reached 100% — the caller
 * decides what that means, because issuing a certificate is a different
 * concern from counting lessons.
 *
 * @param {{ studentId: string, courseId: string, session?: import("mongoose").ClientSession, touchActivity?: boolean }} input
 */
export async function recalculateProgress({
  studentId,
  courseId,
  session,
  touchActivity = false,
}) {
  const enrollment = await Enrollment.findOne({
    student_id: studentId,
    course_id: courseId,
  }).session(session ?? null);

  if (!enrollment) return { enrollment: null, justCompleted: false, breakdown: null };

  const breakdown = await progressBreakdown(studentId, courseId);
  const wasCompleted = enrollment.status === "completed";

  enrollment.progress = breakdown.percentage;
  if (touchActivity) enrollment.last_activity_at = new Date();

  const nowComplete = breakdown.has_content && breakdown.percentage >= 100;

  if (nowComplete && !wasCompleted) {
    enrollment.status = "completed";
    enrollment.completed_at = new Date();
  } else if (!nowComplete && wasCompleted) {
    // Content was added after they finished, so they are mid-course again.
    // The certificate they already hold is not revoked — they earned it
    // against the course as it stood.
    enrollment.status = "active";
    enrollment.completed_at = null;
  }

  await enrollment.save({ session });

  return {
    enrollment,
    breakdown,
    justCompleted: nowComplete && !wasCompleted,
  };
}

/**
 * Recalculates every enrolment on a course.
 *
 * Called when content is added or removed, which shifts the denominator for
 * everyone enrolled. Sequential rather than parallel: a popular course could
 * have hundreds of enrolments, and firing hundreds of concurrent recalcs at
 * an M0 Atlas cluster is how a free tier falls over.
 *
 * Failures are logged per enrolment rather than aborting the loop — one
 * student's broken row must not stop the other ninety-nine being corrected.
 *
 * @param {string} courseId
 */
export async function recalculateCourse(courseId) {
  const enrollments = await Enrollment.find({
    course_id: courseId,
    status: { $in: ["active", "completed"] },
  }).select("student_id");

  let updated = 0;
  for (const enrollment of enrollments) {
    try {
      await recalculateProgress({
        studentId: enrollment.student_id,
        courseId,
      });
      updated += 1;
    } catch (err) {
      logger.error(
        { err, course_id: String(courseId), student_id: String(enrollment.student_id) },
        "Could not recalculate progress for an enrolment"
      );
    }
  }

  if (updated > 0) {
    logger.info({ course_id: String(courseId), updated }, "Recalculated course progress");
  }
  return updated;
}

/** True when the id is a well-formed ObjectId. */
export function isValidId(id) {
  return mongoose.isValidObjectId(id);
}
