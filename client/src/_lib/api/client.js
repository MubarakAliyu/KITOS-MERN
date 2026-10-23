import axios from "axios";
import { getSession, signOut } from "next-auth/react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Single shared axios instance. Every service in src/_lib/api/* imports this.
// 20 s rather than 8 s: the API runs on Render's free tier, where a cold
// service can take well over ten seconds to answer its first request.
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

// Automatically attach the JWT token to outgoing request headers in the browser environment
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const session = await getSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }
  return config;
});

// Guard against a sign-out storm: several in-flight requests can each come
// back 401 after a token is revoked (password change, deactivation), and each
// would otherwise call signOut() and race the redirect.
let signingOut = false;

// Retry once on a network error. Covers a Render cold start that drops the
// first connection, and the brief race window when MSW is still booting.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    if (error.response?.status === 401) {
      console.error(
        `[API 401 Unauthorized] Request URL: ${error.config?.url}\n` +
        `Error Message: ${error.response.data?.error || "Unknown error"}\n` +
        `Actual Reason: ${error.response.data?.reason || "No detail provided"}`
      );

      // The token is gone, expired or revoked. End the NextAuth session once
      // and send the user to sign in again rather than leaving the dashboard
      // half-loaded. /login itself is exempt: a failed sign-in is a 401 the
      // login form handles on its own.
      const isLoginRequest = (config?.url || "").includes("/login");
      if (typeof window !== "undefined" && !signingOut && !isLoginRequest) {
        signingOut = true;
        signOut({ callbackUrl: "/login" });
      }
      return Promise.reject(error);
    }

    if (config && !config._retry && error.code === "ERR_NETWORK") {
      config._retry = true;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return apiClient(config);
    }
    return Promise.reject(error);
  }
);
