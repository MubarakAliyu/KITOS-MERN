/**
 * Model barrel. Importing this registers every schema with Mongoose, which
 * matters for `ref` resolution and for index creation at boot.
 *
 * Batch 1 — identity and families.
 */
export { User } from "./User.js";
export { Student } from "./Student.js";
export { Consent } from "./Consent.js";
export { Cohort } from "./Cohort.js";
export { Counter } from "./Counter.js";
export { Setting } from "./Setting.js";
export { ActivityLog } from "./ActivityLog.js";
export { Notification } from "./Notification.js";

/** Batch 2 — learning content, assessment, progress and sessions. */
export { Course } from "./Course.js";
export { Module } from "./Module.js";
export { Lesson } from "./Lesson.js";
export { Quiz } from "./Quiz.js";
export { QuizAttempt } from "./QuizAttempt.js";
export { Assignment } from "./Assignment.js";
export { Submission } from "./Submission.js";
export { Enrollment } from "./Enrollment.js";
export { LessonCompletion } from "./LessonCompletion.js";
export { Certificate } from "./Certificate.js";
export { Session } from "./Session.js";
export { Attendance } from "./Attendance.js";
export { Recording } from "./Recording.js";

/**
 * Batch 3 adds payments, subscriptions, conversations, messages and
 * announcements.
 */
