import { create } from "zustand";
import { parseNotification } from "@/_lib/notifications/parser";

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

  markAllRead: () =>
    set({
      unreadCount: 0,
      notifications: get().notifications.map((n) => ({ ...n, is_read: true })),
    }),

  markOneRead: (id) =>
    set((s) => {
      const target = s.notifications.find((n) => n.id === id);
      const wasUnread = target && !target.is_read;
      return {
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    }),

  setNotifications: (list) => {
    const parsedList = (list || []).map(parseNotification);
    set({
      notifications: parsedList,
      unreadCount: parsedList.filter((n) => !n.is_read).length,
    });
  },
}));
