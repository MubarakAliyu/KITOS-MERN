// Schema typedefs for the Kids In Tech LMS.
//
// Field names mirror the backend schema EXACTLY — never rename or alias.
// Entities marked with `[Backend-confirmed]` come from the project rules; entities
// marked with `[Pending verification]` use a reasonable LMS shape and MUST be
// reconciled with the backend before live API integration.

// ---------------------------------------------------------------------------
// Core identities
// ---------------------------------------------------------------------------

/**
 * [Backend-confirmed]
 * @typedef {Object} User
 * @property {string} id
 * @property {'admin'|'instructor'|'student'|'parent'} role
 * @property {string} email
 * @property {'en'|'ha'} language_preference
 */

/**
 * [Backend-confirmed — derived]
 * A Parent is a User with role === 'parent'. No separate parents table is
 * defined in the schema; child records reference the parent's user id via
 * `students.parent_id`.
 * @typedef {User & { role: 'parent' }} Parent
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Student
 * @property {string} id
 * @property {string} parent_id   References User.id where role === 'parent'.
 * @property {string} name
 * @property {number} age
 * @property {string} programme_track
 */

// ---------------------------------------------------------------------------
// Course catalogue
// ---------------------------------------------------------------------------

/**
 * [Backend-confirmed]
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} price
 * @property {'subscription'|'one_time'} payment_type
 * @property {string} instructor_id   References User.id where role === 'instructor'.
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Module
 * @property {string} id
 * @property {string} course_id
 * @property {string} title
 * @property {number} order_index
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} module_id
 * @property {string} title
 * @property {string} content_type   e.g. "video" | "text" | "quiz" — confirm enum with backend.
 * @property {string} youtube_url
 * @property {string} body_content
 * @property {number} order_index
 */

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

/**
 * [Pending verification] — confirm field names with backend before integration.
 * @typedef {Object} Quiz
 * @property {string} id
 * @property {string} lesson_id
 * @property {string} title
 * @property {number} order_index
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Question
 * @property {string} id
 * @property {string} quiz_id
 * @property {string} question_text
 * @property {string} question_type   e.g. "mcq" — confirm enum with backend.
 * @property {string[]} options
 * @property {string} correct_answer  Stored as the literal answer string.
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Assignment
 * @property {string} id
 * @property {string} module_id
 * @property {string} title
 * @property {string} instructions
 * @property {string} deadline                       YYYY-MM-DD.
 * @property {'pending'|'submitted'|'reviewed'} status
 * @property {string} [feedback]                     Present once status === 'reviewed'.
 * @property {string} [grade]                        Present once status === 'reviewed'.
 */

/**
 * [Pending verification] — confirm field names with backend before integration.
 * @typedef {Object} Submission
 * @property {string} id
 * @property {string} assignment_id
 * @property {string} student_id
 * @property {string} content
 * @property {string} file_url
 * @property {number|null} grade
 * @property {'pending'|'submitted'|'graded'} status
 * @property {string} submitted_at     ISO 8601.
 */

// ---------------------------------------------------------------------------
// Communication & commerce
// ---------------------------------------------------------------------------

/**
 * [Backend-confirmed]
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} sender_id
 * @property {string} receiver_id
 * @property {string} message
 * @property {string} file_url
 * @property {string} created_at       ISO 8601.
 */

/**
 * [Backend-confirmed]
 * @typedef {Object} Payment
 * @property {string} id
 * @property {string} parent_id
 * @property {string} student_id
 * @property {number} amount
 * @property {string} type             e.g. "subscription" | "one_time" — confirm enum with backend.
 * @property {string} status           e.g. "pending" | "success" | "failed" — confirm enum with backend.
 * @property {string} paystack_ref
 * @property {string} created_at       ISO 8601.
 */

/**
 * [Backend-confirmed]
 * @typedef {'lesson_published'|'assignment_feedback'|'quiz_result'
 *  |'course_complete'|'new_course'|'progress_milestone'} NotificationType
 *
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} user_id
 * @property {NotificationType} type
 * @property {string} title
 * @property {string} message
 * @property {boolean} is_read
 * @property {string} created_at       ISO 8601.
 * @property {string} [link]           Optional deep link.
 */

// This file exports nothing at runtime — typedefs are JSDoc-only.
export {};
