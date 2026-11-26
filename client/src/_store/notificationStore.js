import { create } from "zustand";
import { parseNotification } from "@/_lib/notifications/parser";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/_lib/api/notifications";

/**
 * @typedef {import('@/_types/schema').Notification} Notification
 * @typedef {import('@/_types/schema').NotificationType} NotificationType
 *
 * Known notification types (mirrors NotificationType in schema.js):
 *   'lesson_published' | 'assignment_feedback' | 'quiz_result'
 *   'course_complete' | 'new_course' | 'progress_milestone'
 */
export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (n) => {
    const parsed = parseNotification(n);
    set((s) => ({
      notifications: [parsed, ...s.notifications],
      unreadCount: s.unreadCount + (parsed.is_read ? 0 : 1),
    }));
  },

  /**
   * Marks everything read here and on the server.
   *
   * The local update happens first and is not rolled back if the request
   * fails: the badge clearing is what the user asked for, and a read receipt
   * is not worth making them watch a spinner or showing them an error about.
   * A failed call simply means the badge returns on the next page load.
   */
  markAllRead: () => {
    set({
      unreadCount: 0,
      notifications: get().notifications.map((n) => ({ ...n, is_read: true })),
    });
    markAllNotificationsRead().catch(() => {});
  },

  markOneRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.is_read) return;

    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    markNotificationRead(id).catch(() => {});
  },

  setNotifications: (list) => {
    const parsedList = (list || []).map(parseNotification);
    set({
      notifications: parsedList,
      unreadCount: parsedList.filter((n) => !n.is_read).length,
    });
  },
}));
