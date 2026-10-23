/**
 * Parses raw notification data from the database.
 * Matches bracket notation `[Title] Message` and classifies standard notification text into types
 * (e.g. payments, enrollments, messages) so the UI displays appropriate titles, icons, and colors.
 */
export function parseNotification(n) {
  if (!n) return n;

  // If already parsed/has type and title, preserve them (e.g. from local live notifications)
  if (n.type && n.title) {
    return n;
  }

  const text = n.message || "";
  let type = "system";
  let title = "System Notification";
  let message = text;

  // Extract bracket notation if present (e.g. "[Announcement] Hello Students")
  const match = text.match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    title = match[1];
    message = match[2];
  }

  const t = text.toLowerCase();

  // Classify based on keyword match
  if (t.includes("payment success") || t.includes("payment_success")) {
    type = "payment_success";
    if (!match) title = "Payment Successful";
  } else if (t.includes("payment failed") || t.includes("payment_failed")) {
    type = "payment_failed";
    if (!match) title = "Payment Failed";
  } else if (t.includes("payment") || t.includes("₦") || t.includes("paid") || t.includes("received")) {
    type = "payment_received";
    if (!match) title = "Payment Received";
  } else if (t.includes("student_enrolled") || t.includes("student enrolled")) {
    type = "student_enrolled";
    if (!match) title = "Student Enrolled";
  } else if (t.includes("enroll") || t.includes("enrolled")) {
    type = "new_enrollment";
    if (!match) title = "New Enrollment";
  } else if (t.includes("registered") || t.includes("child")) {
    type = "child_registered";
    if (!match) title = "Child Registered";
  } else if (t.includes("course_message")) {
    type = "course_message";
    if (!match) title = "Course Message";
  } else if (t.includes("message") || t.includes("chat") || t.includes("said:")) {
    type = "new_message";
    if (!match) title = "New Message";
  } else if (t.includes("lesson_published") || (t.includes("lesson") && t.includes("publish"))) {
    type = "lesson_published";
    if (!match) title = "Lesson Published";
  } else if (t.includes("assignment_feedback") || (t.includes("assignment") && t.includes("feedback"))) {
    type = "assignment_feedback";
    if (!match) title = "Assignment Feedback";
  } else if (t.includes("assignment_submitted") || (t.includes("assignment") && t.includes("submitted"))) {
    type = "assignment_submitted";
    if (!match) title = "Assignment Submitted";
  } else if (t.includes("quiz_result")) {
    type = "quiz_result";
    if (!match) title = "Quiz Result";
  } else if (t.includes("quiz_completed") || (t.includes("quiz") && t.includes("complete"))) {
    type = "quiz_completed";
    if (!match) title = "Quiz Completed";
  } else if (t.includes("course_complete") || (t.includes("course") && t.includes("complete"))) {
    type = "course_complete";
    if (!match) title = "Course Completed";
  } else if (t.includes("progress_milestone") || (t.includes("progress") && t.includes("milestone"))) {
    type = "progress_milestone";
    if (!match) title = "Progress Milestone";
  } else if (t.includes("new_course")) {
    type = "new_course";
    if (!match) title = "New Course Available";
  } else if (t.includes("course") && t.includes("created")) {
    type = "course_created";
    if (!match) title = "Course Created";
  } else if (t.includes("user_joined") || t.includes("joined")) {
    type = "user_joined";
    if (!match) title = "User Joined";
  } else if (t.includes("account_created") || t.includes("account created") || t.includes("profile created")) {
    type = "account_created";
    if (!match) title = "Account Created";
  } else if (t.includes("login") || t.includes("logged in")) {
    type = "student_login";
    if (!match) title = "Student Login";
  }

  return {
    ...n,
    type,
    title,
    message
  };
}
