import { apiClient } from "./client";

/** Returns the signed-in parent's profile. */
export async function getParentMe() {
  const { data } = await apiClient.get("/parents/me");
  return data;
}

/** Returns the parent's children, in display order. */
export async function getChildren() {
  const { data } = await apiClient.get("/parents/me/children");
  return data;
}

/** Returns the per-course progress feed for a single student. */
export async function getStudentProgress(studentId) {
  const { data } = await apiClient.get(`/students/${studentId}/progress`);
  return data;
}

/**
 * Creates a new child profile linked to the current parent.
 * @param {{ name: string, age: number, programme_track: string }} payload
 */
export async function addChild(payload) {
  const { data } = await apiClient.post("/students", payload);
  return data;
}
