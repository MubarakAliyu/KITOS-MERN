import { apiClient } from "./client";

/**
 * Returns notifications, newest first. Pass a `user_id` to fetch a
 * specific user's feed (e.g. the parent's). Omitting it falls back to
 * the current user's feed on the backend.
 */
export async function getNotifications(userId) {
  const url = userId ? `/notifications?user_id=${userId}` : "/notifications";
  const { data } = await apiClient.get(url);
  return data;
}

/** Marks one notification read. */
export async function markNotificationRead(id) {
  const { data } = await apiClient.put(`/notifications/${id}/read`);
  return data;
}

/** Marks the signed-in user's whole feed read. */
export async function markAllNotificationsRead() {
  const { data } = await apiClient.put("/notifications/read-all");
  return data;
}

/**
 * Sends an announcement, or fires a platform event.
 *
 * The same endpoint serves both: a non-admin can only ever notify
 * administrators, whatever audience they ask for, so `adminNotify.js` uses it
 * for platform events and the admin modal uses it to broadcast.
 */
export async function sendAnnouncement(payload) {
  const { data } = await apiClient.post("/admin/notifications/send", payload);
  return data;
}
