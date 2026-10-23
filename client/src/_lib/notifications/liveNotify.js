"use client";

import { toast } from "sonner";
import { useNotificationStore } from "@/_store/notificationStore";

// Templates keep the toast + bell copy in sync per event type. Adding a new
// event type is one map entry; the call site stays a single notify() call.
// Icons render in the bell via NotificationDropdown's type → Lucide map.
const TEMPLATES = {
  lesson_saved: {
    title: "Lesson Saved",
    message: (d) => `"${d.title}" has been updated`,
    toastType: "success",
  },
  lesson_deleted: {
    title: "Lesson Deleted",
    message: (d) => `"${d.title}" was removed`,
    toastType: "error",
  },
  quiz_created: {
    title: "Quiz Created",
    message: (d) => `New quiz added to ${d.module}`,
    toastType: "success",
  },
  assignment_created: {
    title: "Assignment Created",
    message: (d) => `New assignment: ${d.title}`,
    toastType: "success",
  },
  assignment_updated: {
    title: "Assignment Updated",
    message: (d) => `"${d.title}" was updated`,
    toastType: "success",
  },
  user_created: {
    title: "User Created",
    message: (d) => `Account created for ${d.name}`,
    toastType: "success",
  },
  user_deactivated: {
    title: "User Deactivated",
    message: (d) => `${d.name} can no longer login`,
    toastType: "error",
  },
  course_published: {
    title: "Course Published",
    message: (d) => `"${d.title}" is now live`,
    toastType: "success",
  },
  course_unpublished: {
    title: "Course Unpublished",
    message: (d) => `"${d.title}" set to draft`,
    toastType: "info",
  },
  feedback_submitted: {
    title: "Feedback Sent",
    message: (d) => `Grade submitted for ${d.student}`,
    toastType: "success",
  },
  announcement_sent: {
    title: "Announcement Sent",
    message: (d) => `Sent to ${d.count} users`,
    toastType: "success",
  },
  payment_received: {
    title: "Payment Received",
    message: (d) =>
      `₦${Number(d.amount ?? 0).toLocaleString()} from ${d.parent}`,
    toastType: "success",
  },
  child_registered: {
    title: "Child Registered",
    message: (d) => `${d.child} added by ${d.parent}`,
    toastType: "info",
  },
  assignment_submitted: {
    title: "Assignment Submitted",
    message: (d) => `${d.student} submitted ${d.title}`,
    toastType: "info",
  },
  new_message: {
    title: "New Message",
    message: (d) => `${d.sender}: ${d.message}`,
    toastType: "info",
  },
};

function fireToast(type, title, message) {
  const fn = toast[type] ?? toast.success;
  fn(title, { description: message, duration: 4000 });
}

/**
 * Hook returning a `notify(type, data)` helper. The call site fires a
 * sonner toast AND prepends the event into the notificationStore so the
 * Topbar bell badge increments and shakes.
 */
export function useLiveNotify() {
  const { addNotification } = useNotificationStore();

  function notify(type, data = {}) {
    const tmpl = TEMPLATES[type];
    if (!tmpl) return;
    const message = typeof tmpl.message === "function" ? tmpl.message(data) : "";
    fireToast(tmpl.toastType, tmpl.title, message);
    addNotification({
      id: `notif_${Date.now()}`,
      type,
      title: tmpl.title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
      link: data.link ?? "#",
    });
  }

  return { notify };
}
