import { apiClient } from "./client";

/** Returns all courses the current user can see. */
export async function getCourses() {
  const { data } = await apiClient.get("/courses");
  return data;
}

/** Returns a single course (filtered from the listing). */
export async function getCourse(id) {
  const courses = await getCourses();
  return courses.find((c) => String(c.id) === String(id)) ?? null;
}

/** Returns the modules belonging to a course. */
export async function getCourseModules(courseId) {
  const { data } = await apiClient.get(`/courses/${courseId}/modules`);
  return data;
}

/**
 * Renames, re-describes or reorders a module.
 *
 * `PUT /modules/:id`. There was no such endpoint until now, which is why the
 * course editor's module rows could only be created and deleted, and why its
 * up/down arrows rearranged the page and nothing else.
 */
export async function updateModule(id, payload) {
  const { data } = await apiClient.put(`/modules/${id}`, payload);
  return data;
}

/** Deletes a module. */
export async function deleteModule(id) {
  const { data } = await apiClient.delete(`/modules/${id}`);
  return data;
}

/**
 * The programme tracks a form may offer.
 *
 * Tracks are rows now, not three strings copied into four React components,
 * so the forms ask for them. Active only: an archived track stays on the
 * records already filed under it but is not offered for new work.
 */
export async function getTracks({ includeArchived = false } = {}) {
  const { data } = await apiClient.get("/tracks", {
    params: includeArchived ? { include_archived: "1" } : undefined,
  });
  return data;
}

/** Opens a new programme track. Admin only. */
export async function createTrack(payload) {
  const { data } = await apiClient.post("/admin/tracks", payload);
  return data;
}

/** Renames a track, re-describes it, or archives and reactivates it. */
export async function updateTrack(id, payload) {
  const { data } = await apiClient.put(`/admin/tracks/${id}`, payload);
  return data;
}

/** Deletes a track. Refused by the API if anything still references it. */
export async function deleteTrack(id) {
  const { data } = await apiClient.delete(`/admin/tracks/${id}`);
  return data;
}
