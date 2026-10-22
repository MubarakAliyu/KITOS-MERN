import { apiClient } from "./client";

/** Returns the currently signed-in student's profile. */
export async function getStudentMe() {
  const { data } = await apiClient.get("/students/me");
  return data;
}
