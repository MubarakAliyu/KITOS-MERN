import { apiClient } from "./client";

/**
 * Updates the user's password. Stub backend.
 * @param {{ current_password?: string, new_password: string,
 *           temp_token?: string }} payload
 *
 * The optional `temp_token` is used by the force-reset flow for
 * admin-created accounts on first login.
 */
export async function changePassword(payload) {
  const { data } = await apiClient.post("/user/change-password", payload);
  return data;
}

/**
 * Updates editable profile fields (name, phone). Stub backend.
 * @param {{ name?: string, phone?: string }} payload
 */
export async function updateProfile(payload) {
  const { data } = await apiClient.put("/user/profile", payload);
  return data;
}

export async function getPlatformSettings() {
  const { data } = await apiClient.get("/platform/settings");
  return data;
}

export async function updatePlatformSettings(payload) {
  const { data } = await apiClient.post("/platform/settings", payload);
  return data;
}
