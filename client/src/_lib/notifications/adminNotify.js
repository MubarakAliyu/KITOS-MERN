import { apiClient } from "../api/client";

// Map of event types → display copy. The fan-in handler at
// POST /admin/notifications/send persists each into the admin's feed; non-
// admin targets pass through the same endpoint by setting `target`.
const TEMPLATES = {
  student_login: {
    title: "Student Login",
    message: ({ name }) => `${name} logged in`,
    priority: false,
  },
  assignment_submitted: {
    title: "Assignment Submitted",
    message: ({ student_name, assignment_title }) =>
      `${student_name} submitted "${assignment_title}"`,
    priority: false,
  },
  payment_made: {
    title: "Payment Received",
    message: ({ amount, parent_name, course_title }) =>
      `₦${Number(amount).toLocaleString()} received from ${parent_name} for ${course_title}`,
    priority: true,
  },
  quiz_completed: {
    title: "Quiz Completed",
    message: ({ student_name, score, quiz_title }) =>
      `${student_name} scored ${score}% on ${quiz_title}`,
    priority: false,
  },
  child_registered: {
    title: "New Child Registered",
    message: ({ parent_name, child_name, track }) =>
      `${parent_name} registered ${child_name} for ${track}`,
    priority: true,
  },
  course_completed: {
    title: "Course Completed",
    message: ({ student_name, course_title }) =>
      `${student_name} completed ${course_title}`,
    priority: true,
  },
};

/**
 * Fire-and-forget helper that emits a typed admin notification. Failures are
 * swallowed (logged at debug) because none of the calling flows should block
 * on the admin feed.
 */
export async function notifyAdmin(type, data = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl) return;

  try {
    await apiClient.post("/admin/notifications/send", {
      target: "admin",
      type,
      title: tpl.title,
      message: tpl.message(data),
      priority: tpl.priority,
      ...data,
    });
  } catch (e) {
    console.debug("Admin notify failed:", e?.message ?? e);
  }
}
