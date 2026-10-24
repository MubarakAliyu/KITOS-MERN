import { Router } from "express";

import * as c from "../controllers/learning.js";
import { validate, idParamSchema } from "../middleware/validate.js";
import {
  authenticate,
  requirePermission,
  requireRole,
} from "../middleware/authenticate.js";
import * as s from "../validators/schemas.js";

/**
 * Batch 2 routes: courses, content, assessment, progress, certificates and
 * sessions (PRD §9.3, §9.4).
 *
 * Same reading order as Batch 1: authenticate, then permission, then
 * validate, then the controller — with ownership narrowed inside the service.
 * The matrix answers whether a role may ever do this; the service answers
 * whether they may do it to this particular record.
 *
 * Route order matters in a few places. A literal path must be registered
 * before a parameterised one that would also match it, or Express hands
 * `/sessions/cancellations` to the `/sessions/:id` handler and the id fails
 * validation.
 */
export const learningRouter = Router();

// ── Public ──────────────────────────────────────────────────────────────────

/**
 * Certificate verification is deliberately public and unauthenticated: the
 * point is that anyone handed a certificate can check it. The response
 * carries initials only, never enough to identify a child (FR11).
 */
learningRouter.get(
  "/certificates/verify/:code",
  validate({ params: s.verifyCodeParam }),
  c.getVerifyCertificate
);

// ── Courses and content ─────────────────────────────────────────────────────

learningRouter.get(
  "/courses",
  authenticate,
  requirePermission("content.read"),
  validate({ query: s.listCoursesQuery }),
  c.getCourses
);

learningRouter.get(
  "/courses/:id/modules",
  authenticate,
  requirePermission("content.read"),
  validate({ params: idParamSchema }),
  c.getCourseModules
);

learningRouter.post(
  "/courses",
  authenticate,
  requirePermission("course.create"),
  validate({ body: s.createCourseBody }),
  c.postCourse
);

learningRouter.get(
  "/modules/:id/lessons",
  authenticate,
  requirePermission("content.read"),
  validate({ params: idParamSchema }),
  c.getModuleLessons
);

learningRouter.post(
  "/modules",
  authenticate,
  requirePermission("course.edit"),
  validate({ body: s.createModuleBody }),
  c.postModule
);

learningRouter.delete(
  "/modules/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema }),
  c.deleteModule
);

learningRouter.get(
  "/lessons/:id",
  authenticate,
  requirePermission("content.read"),
  validate({ params: idParamSchema }),
  c.getLesson
);

learningRouter.post(
  "/lessons",
  authenticate,
  requirePermission("course.edit"),
  validate({ body: s.createLessonBody }),
  c.postLesson
);

learningRouter.put(
  "/lessons/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema, body: s.updateLessonBody }),
  c.putLesson
);

learningRouter.delete(
  "/lessons/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema }),
  c.deleteLesson
);

/** Completing a lesson is student-only, by the matrix. */
learningRouter.post(
  "/lessons/:id/complete",
  authenticate,
  requirePermission("lesson.complete"),
  validate({ params: idParamSchema }),
  c.postLessonComplete
);

// ── Assessment ──────────────────────────────────────────────────────────────

learningRouter.post(
  "/quizzes",
  authenticate,
  requirePermission("course.edit"),
  validate({ body: s.createQuizBody }),
  c.postQuiz
);

learningRouter.put(
  "/quizzes/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema, body: s.updateQuizBody }),
  c.putQuiz
);

learningRouter.delete(
  "/quizzes/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema }),
  c.deleteQuiz
);

/** Students get the questions without the answers; staff get everything. */
learningRouter.get(
  "/quizzes/:id/questions",
  authenticate,
  requirePermission("content.read"),
  validate({ params: idParamSchema }),
  c.getQuizQuestions
);

learningRouter.post(
  "/quiz/submit",
  authenticate,
  requirePermission("quiz.submit"),
  validate({ body: s.submitQuizBody }),
  c.postQuizSubmit
);

/** Before `/assignments/:id`, which would otherwise swallow it. */
learningRouter.get(
  "/assignments/instructor",
  authenticate,
  requirePermission("submission.review"),
  c.getInstructorAssignments
);

learningRouter.get(
  "/assignments",
  authenticate,
  requireRole("student"),
  c.getAssignments
);

learningRouter.post(
  "/assignments/submit",
  authenticate,
  requirePermission("assignment.submit"),
  validate({ body: s.submitAssignmentBody }),
  c.postAssignmentSubmit
);

learningRouter.post(
  "/assignments",
  authenticate,
  requirePermission("course.edit"),
  validate({ body: s.createAssignmentBody }),
  c.postAssignment
);

learningRouter.put(
  "/assignments/:id/feedback",
  authenticate,
  requirePermission("submission.review"),
  validate({ params: idParamSchema, body: s.assignmentFeedbackBody }),
  c.putAssignmentFeedback
);

learningRouter.put(
  "/assignments/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema, body: s.updateAssignmentBody }),
  c.putAssignment
);

// ── Certificates ────────────────────────────────────────────────────────────

learningRouter.get(
  "/certificates",
  authenticate,
  requirePermission("content.read"),
  c.getCertificates
);

learningRouter.get(
  "/certificates/:id/pdf",
  authenticate,
  requirePermission("content.read"),
  validate({ params: idParamSchema }),
  c.getCertificatePdf
);

// ── Sessions ────────────────────────────────────────────────────────────────

/** Literal path first: `/sessions/:id` would match "cancellations". */
learningRouter.get(
  "/sessions/cancellations",
  authenticate,
  requirePermission("session.view"),
  c.getSessionCancellations
);

learningRouter.get(
  "/sessions",
  authenticate,
  requirePermission("session.view"),
  validate({ query: s.listSessionsQuery }),
  c.getSessions
);

learningRouter.post(
  "/sessions",
  authenticate,
  requirePermission("session.manage"),
  validate({ body: s.createSessionBody }),
  c.postSession
);

learningRouter.get(
  "/sessions/:id",
  authenticate,
  requirePermission("session.view"),
  validate({ params: idParamSchema }),
  c.getSessionById
);

learningRouter.put(
  "/sessions/:id",
  authenticate,
  requirePermission("session.manage"),
  validate({ params: idParamSchema, body: s.updateSessionBody }),
  c.putSession
);

learningRouter.post(
  "/sessions/:id/cancel",
  authenticate,
  requirePermission("session.manage"),
  validate({ params: idParamSchema, body: s.cancelSessionBody }),
  c.postCancelSession
);

learningRouter.post(
  "/sessions/:id/reschedule",
  authenticate,
  requirePermission("session.manage"),
  validate({ params: idParamSchema, body: s.rescheduleSessionBody }),
  c.postRescheduleSession
);

learningRouter.get(
  "/sessions/:id/roster",
  authenticate,
  requirePermission("attendance.mark"),
  validate({ params: idParamSchema }),
  c.getSessionRoster
);

learningRouter.put(
  "/sessions/:id/attendance",
  authenticate,
  requirePermission("attendance.mark"),
  validate({ params: idParamSchema, body: s.saveAttendanceBody }),
  c.putSessionAttendance
);

learningRouter.get(
  "/sessions/:id/attendance",
  authenticate,
  requirePermission("session.view"),
  validate({ params: idParamSchema }),
  c.getSessionAttendance
);

/** The instructor shows this as a QR code; it lives for 60 seconds. */
learningRouter.post(
  "/sessions/:id/qr-token",
  authenticate,
  requirePermission("attendance.mark"),
  validate({ params: idParamSchema }),
  c.postQrToken
);

/** The student scans it, or joins an online class. */
learningRouter.post(
  "/sessions/:id/check-in",
  authenticate,
  requireRole("student"),
  validate({ params: idParamSchema, body: s.checkInBody }),
  c.postCheckIn
);

learningRouter.post(
  "/sessions/:id/recordings",
  authenticate,
  requirePermission("recording.add"),
  validate({ params: idParamSchema, body: s.addRecordingBody }),
  c.postRecording
);

learningRouter.get(
  "/recordings",
  authenticate,
  requirePermission("session.view"),
  c.getRecordings
);

learningRouter.get(
  "/instructors/me/sessions",
  authenticate,
  requireRole("instructor", "admin"),
  c.getInstructorSessions
);

// ── Admin ───────────────────────────────────────────────────────────────────

learningRouter.get(
  "/admin/courses/:id/editor",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema }),
  c.getCourseEditor
);

learningRouter.get(
  "/admin/courses",
  authenticate,
  requirePermission("course.edit"),
  c.getAdminCourses
);

learningRouter.post(
  "/admin/courses",
  authenticate,
  requirePermission("course.create"),
  validate({ body: s.createCourseBody }),
  c.postCourse
);

learningRouter.put(
  "/admin/courses/:id",
  authenticate,
  requirePermission("course.edit"),
  validate({ params: idParamSchema, body: s.updateCourseBody }),
  c.putCourse
);

learningRouter.delete(
  "/admin/courses/:id",
  authenticate,
  requirePermission("course.create"),
  validate({ params: idParamSchema }),
  c.deleteCourse
);

learningRouter.post(
  "/admin/courses/:id/publish",
  authenticate,
  requirePermission("course.publish"),
  validate({ params: idParamSchema }),
  c.postPublishCourse
);

learningRouter.post(
  "/admin/courses/:id/unpublish",
  authenticate,
  requirePermission("course.publish"),
  validate({ params: idParamSchema }),
  c.postUnpublishCourse
);

learningRouter.post(
  "/admin/enrollments",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.enrolBody }),
  c.postAdminEnrol
);

learningRouter.post(
  "/admin/enrollments/remove",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.enrolBody }),
  c.postAdminUnenrol
);

/** Both literal paths before `/admin/sessions`, for the same reason. */
learningRouter.get(
  "/admin/sessions/overview",
  authenticate,
  requirePermission("analytics.view"),
  c.getAdminSessionsOverview
);

learningRouter.get(
  "/admin/sessions/attendance-report",
  authenticate,
  requirePermission("analytics.view"),
  c.getAdminAttendanceReport
);

learningRouter.get(
  "/admin/sessions",
  authenticate,
  requirePermission("analytics.view"),
  validate({ query: s.adminSessionsQuery }),
  c.getAdminSessions
);

// ── Instructor ──────────────────────────────────────────────────────────────

learningRouter.get(
  "/instructors/me/courses",
  authenticate,
  requireRole("instructor", "admin"),
  c.getInstructorCourses
);

learningRouter.get(
  "/instructors/me/students",
  authenticate,
  requireRole("instructor", "admin"),
  c.getInstructorStudents
);
