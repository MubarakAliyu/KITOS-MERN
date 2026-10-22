import { apiClient } from "./client";

/** Returns all certificates (locked + unlocked) for the current student. */
export async function getCertificates() {
  const { data } = await apiClient.get("/certificates");
  return data;
}
