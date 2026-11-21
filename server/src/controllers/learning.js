import * as courseService from "../services/course.service.js";
import * as assessmentService from "../services/assessment.service.js";
import * as enrollmentService from "../services/enrollment.service.js";
import * as sessionService from "../services/session.service.js";
import { renderCertificatePdf } from "../lib/certificatePdf.js";
import { clientIp, logActivity } from "../lib/audit.js";

/**
 * Batch 2 controllers: courses, assessment, progress, certificates and
 * sessions.
 *
 * Same contract as Batch 1 — unpack the request, call one service, send the
 * response. No business rules here.
 */

const handle = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const actorOf = (req) =>
  req.user
    ? { id: String(req.user._id), role: req.user.role, name: req.user.name }
    : null;

// ── Courses and content ─────────────────────────────────────────────────────

export const getCourses = handle(async (req, res) => {
  res.status(200).json(
    await courseService.listCourses({ user: req.user, query: req.query })
  );
});

export const getCourseModules = handle(async (req, res) => {
  res.status(200).json(
    await courseService.listCourseModules({
      user: req.user,
      courseId: req.params.id,
    })
  );
});

export const getModuleLessons = handle(async (req, res) => {
  res.status(200).json(
    await courseService.listModuleLessons({
      user: req.user,
      moduleId: req.params.id,
    })
  );
});

export const getLesson = handle(async (req, res) => {
  res.status(200).json(
    await courseService.getLesson({ user: req.user, lessonId: req.params.id })
  );
});

export const postCourse = handle(async (req, res) => {
  const course = await courseService.createCourse({
    user: req.user,
    payload: req.body,
  });
  await logActivity({
    actor: actorOf(req),
    action: "created_course",
    description: `Created course: ${course.title}`,
    target_type: "course",
    target_id: course.id,
    ip: clientIp(req),
  });
  res.status(201).json(course);
});

export const putCourse = handle(async (req, res) => {
  const course = await courseService.updateCourse({
    user: req.user,
    courseId: req.params.id,
    payload: req.body,
  });
  await logActivity({
    actor: actorOf(req),
    action: "updated_course",
    description: `Updated course: ${course.title}`,
    target_type: "course",
    target_id: course.id,
    ip: clientIp(req),
  });
  res.status(200).json(course);
});

export const deleteCourse = handle(async (req, res) => {
  const result = await courseService.deleteCourse({
    user: req.user,
    courseId: req.params.id,
  });
  await logActivity({
    actor: actorOf(req),
    action: "deleted_course",
    description: `Deleted course ${req.params.id} and all its content`,
    target_type: "course",
    target_id: req.params.id,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

const setPublished = (published) =>
  handle(async (req, res) => {
    const course = await courseService.setCoursePublished({
      user: req.user,
      courseId: req.params.id,
      published,
    });
    await logActivity({
      actor: actorOf(req),
      action: published ? "published_course" : "unpublished_course",
      description: `${published ? "Published" : "Unpublished"} course: ${course.title}`,
      target_type: "course",
      target_id: course.id,
      ip: clientIp(req),
    });
    res.status(200).json(course);
  });

export const postPublishCourse = setPublished(true);
export const postUnpublishCourse = setPublished(false);

export const getAdminCourses = handle(async (_req, res) => {
  res.status(200).json(await courseService.listAdminCourses());
});

export const getCourseEditor = handle(async (req, res) => {
  res.status(200).json(
    await courseService.getCourseEditor({ user: req.user, courseId: req.params.id })
  );
});

export const postModule = handle(async (req, res) => {
  res.status(201).json(
    await courseService.createModule({ user: req.user, payload: req.body })
  );
});

export const deleteModule = handle(async (req, res) => {
  res.status(200).json(
    await courseService.deleteModule({ user: req.user, moduleId: req.params.id })
  );
});

export const postLesson = handle(async (req, res) => {
  res.status(201).json(
    await courseService.createLesson({ user: req.user, payload: req.body })
  );
});

export const putLesson = handle(async (req, res) => {
  res.status(200).json(
    await courseService.updateLesson({
      user: req.user,
      lessonId: req.params.id,
      payload: req.body,
    })
  );
});

export const deleteLesson = handle(async (req, res) => {
  res.status(200).json(
    await courseService.deleteLesson({ user: req.user, lessonId: req.params.id })
  );
});

export const getInstructorCourses = handle(async (req, res) => {
  res.status(200).json(await courseService.listInstructorCourses(req.user));
});

export const getInstructorStudents = handle(async (req, res) => {
  res.status(200).json(await courseService.listInstructorStudents(req.user));
});

// ── Assessment ──────────────────────────────────────────────────────────────

export const postQuiz = handle(async (req, res) => {
  res.status(201).json(
    await assessmentService.createQuiz({ user: req.user, payload: req.body })
  );
});

export const putQuiz = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.updateQuiz({
      user: req.user,
      quizId: req.params.id,
      payload: req.body,
    })
  );
});

export const deleteQuiz = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.deleteQuiz({ user: req.user, quizId: req.params.id })
  );
});

export const getQuizQuestions = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.getQuizQuestions({
      user: req.user,
      quizId: req.params.id,
    })
  );
});

export const postQuizSubmit = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.submitQuiz({
      user: req.user,
      quizId: req.body.quiz_id,
      answers: req.body.answers,
    })
  );
});

export const postAssignment = handle(async (req, res) => {
  res.status(201).json(
    await assessmentService.createAssignment({ user: req.user, payload: req.body })
  );
});

export const putAssignment = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.updateAssignment({
      user: req.user,
      assignmentId: req.params.id,
      payload: req.body,
    })
  );
});

export const getAssignments = handle(async (req, res) => {
  res.status(200).json(await assessmentService.listStudentAssignments(req.user));
});

export const getInstructorAssignments = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.listInstructorAssignments(req.user)
  );
});

export const postAssignmentSubmit = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.submitAssignment({ user: req.user, payload: req.body })
  );
});

export const putAssignmentFeedback = handle(async (req, res) => {
  res.status(200).json(
    await assessmentService.reviewSubmission({
      user: req.user,
      assignmentId: req.params.id,
      payload: req.body,
    })
  );
});

// ── Progress and certificates ───────────────────────────────────────────────

export const postLessonComplete = handle(async (req, res) => {
  res.status(200).json(
    await enrollmentService.completeLesson({
      user: req.user,
      lessonId: req.params.id,
    })
  );
});

export const getCertificates = handle(async (req, res) => {
  res.status(200).json(await enrollmentService.listCertificates(req.user));
});

export const getCertificatePdf = handle(async (req, res) => {
  const certificate = await enrollmentService.getCertificateForUser({
    user: req.user,
    certificateId: req.params.id,
  });

  const pdf = await renderCertificatePdf({
    ...certificate.toObject(),
    id: String(certificate._id),
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="KIT-Certificate-${certificate.serial}.pdf"`
  );
  res.status(200).send(pdf);
});

/** Public (FR11). */
export const getVerifyCertificate = handle(async (req, res) => {
  const result = await enrollmentService.verifyCertificate(req.params.code);
  res.status(result.valid ? 200 : 404).json(result);
});

export const postAdminEnrol = handle(async (req, res) => {
  const result = await enrollmentService.adminEnrol({
    studentId: req.body.student_id,
    courseId: req.body.course_id,
  });
  await logActivity({
    actor: actorOf(req),
    action: "enrolled_student",
    description: `Enrolled student ${req.body.student_id} on course ${req.body.course_id}`,
    target_type: "enrollment",
    target_id: result.id,
    ip: clientIp(req),
  });
  res.status(201).json(result);
});

export const postAdminUnenrol = handle(async (req, res) => {
  const result = await enrollmentService.unenrol({
    studentId: req.body.student_id,
    courseId: req.body.course_id,
  });
  await logActivity({
    actor: actorOf(req),
    action: "unenrolled_student",
    description: `Removed student ${req.body.student_id} from course ${req.body.course_id}`,
    target_type: "enrollment",
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

// ── Sessions ────────────────────────────────────────────────────────────────

export const getSessions = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.listSessions({
      user: req.user,
      filter: req.query.filter ?? "all",
    })
  );
});

export const getSessionById = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.getSession({ user: req.user, sessionId: req.params.id })
  );
});

export const getInstructorSessions = handle(async (req, res) => {
  res.status(200).json(await sessionService.listInstructorSessions(req.user));
});

export const postSession = handle(async (req, res) => {
  const session = await sessionService.createSession({
    user: req.user,
    payload: req.body,
  });
  await logActivity({
    actor: actorOf(req),
    action: "created_session",
    description: `Scheduled session: ${session.title}`,
    target_type: "session",
    target_id: session.id,
    ip: clientIp(req),
  });
  res.status(201).json(session);
});

export const putSession = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.updateSession({
      user: req.user,
      sessionId: req.params.id,
      payload: req.body,
    })
  );
});

export const postCancelSession = handle(async (req, res) => {
  const session = await sessionService.cancelSession({
    user: req.user,
    sessionId: req.params.id,
    reason: req.body.reason,
  });
  await logActivity({
    actor: actorOf(req),
    action: "cancelled_session",
    description: `Cancelled session: ${session.title} — ${session.cancel_reason}`,
    target_type: "session",
    target_id: session.id,
    ip: clientIp(req),
  });
  res.status(200).json(session);
});

export const postRescheduleSession = handle(async (req, res) => {
  const session = await sessionService.rescheduleSession({
    user: req.user,
    sessionId: req.params.id,
    scheduledAt: req.body.scheduled_at,
  });
  await logActivity({
    actor: actorOf(req),
    action: "rescheduled_session",
    description: `Rescheduled session: ${session.title}`,
    target_type: "session",
    target_id: session.id,
    ip: clientIp(req),
  });
  res.status(200).json(session);
});

export const getSessionCancellations = handle(async (req, res) => {
  res.status(200).json(await sessionService.listCancellations(req.user));
});

export const getSessionRoster = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.getRoster({ user: req.user, sessionId: req.params.id })
  );
});

export const putSessionAttendance = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.saveAttendance({
      user: req.user,
      sessionId: req.params.id,
      records: req.body.records,
    })
  );
});

export const getSessionAttendance = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.getSessionAttendance({
      user: req.user,
      sessionId: req.params.id,
    })
  );
});

export const postQrToken = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.createQrToken({
      user: req.user,
      sessionId: req.params.id,
    })
  );
});

export const postCheckIn = handle(async (req, res) => {
  res.status(200).json(
    await sessionService.checkIn({
      user: req.user,
      sessionId: req.params.id,
      token: req.body.token,
      method: req.body.method ?? "qr",
    })
  );
});

export const postRecording = handle(async (req, res) => {
  res.status(201).json(
    await sessionService.addRecording({
      user: req.user,
      sessionId: req.params.id,
      payload: req.body,
    })
  );
});

export const getRecordings = handle(async (req, res) => {
  res.status(200).json(await sessionService.listRecordings(req.user));
});

export const getAdminSessionsOverview = handle(async (_req, res) => {
  res.status(200).json(await sessionService.adminOverview());
});

export const getAdminSessions = handle(async (req, res) => {
  res.status(200).json(await sessionService.adminAllSessions(req.query));
});

export const getAdminAttendanceReport = handle(async (_req, res) => {
  res.status(200).json(await sessionService.attendanceReport());
});
