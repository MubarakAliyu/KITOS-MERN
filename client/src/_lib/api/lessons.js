import { apiClient } from "./client";

/** Returns the lessons in a module. */
export async function getModuleLessons(moduleId) {
  const { data } = await apiClient.get(`/modules/${moduleId}/lessons`);
  return data;
}

/**
 * Returns a single lesson with joined breadcrumb fields
 * (module_title, course_id, course_title).
 */
export async function getLesson(lessonId) {
  const { data } = await apiClient.get(`/lessons/${lessonId}`);
  return data;
}

/** Marks a lesson complete. Stub backend, returns { success: true }. */
export async function markLessonComplete(lessonId) {
  const { data } = await apiClient.post(`/lessons/${lessonId}/complete`);
  return data;
}

/** Updates a lesson with a partial body. Returns the persisted record. */
export async function updateLesson(lessonId, payload) {
  const { data } = await apiClient.put(`/lessons/${lessonId}`, payload);
  return data;
}

/** Deletes a lesson. Returns { success: true }. */
export async function deleteLesson(lessonId) {
  const { data } = await apiClient.delete(`/lessons/${lessonId}`);
  return data;
}
