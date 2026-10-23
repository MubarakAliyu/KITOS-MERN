import { apiClient } from "./client";

export const authApi = {
  async login({ email, password }) {
    try {
      const response = await apiClient.post("/login", { email, password });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        return null;
      }
      // Network error (MSW not ready yet) — return null instead of throwing
      // so NextAuth's authorize() callback can return null cleanly.
      console.warn("Login API error:", error.message);
      return null;
    }
  },
};

export async function requestPasswordReset({ email }) {
  const res = await apiClient.post("/forgot-password", { email });
  return res.data;
}

export async function resetPassword({ token, password }) {
  const res = await apiClient.post("/reset-password", { token, password });
  return res.data;
}
