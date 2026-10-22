/**
 * Model barrel. Importing this registers every schema with Mongoose, which
 * matters for `ref` resolution and for `syncIndexes` at boot.
 *
 * Batch 1 set (PRD §8.2). Batches 2 and 3 add courses, modules, lessons,
 * quizzes, assignments, submissions, enrollments, lesson_completions,
 * certificates, sessions, attendance, recordings, payments, subscriptions,
 * conversations, messages and announcements.
 */
export { User } from "./User.js";
export { Student } from "./Student.js";
export { Consent } from "./Consent.js";
export { Cohort } from "./Cohort.js";
export { Counter } from "./Counter.js";
export { Setting } from "./Setting.js";
export { ActivityLog } from "./ActivityLog.js";
export { Notification } from "./Notification.js";
