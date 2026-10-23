import { apiClient } from "./client";

/** Returns all assignments visible to the current student. */
export async function getAssignments() {
  const { data } = await apiClient.get("/assignments");
  return data;
}

/**
 * Submits an assignment.
 * @param {{ assignment_id: string, kind: 'text'|'file'|'link',
 *   content?: string, link?: string, file_name?: string }} payload
 */
export async function submitAssignment(payload) {
  const { data } = await apiClient.post("/assignments/submit", payload);
  return data;
}
