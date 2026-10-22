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
