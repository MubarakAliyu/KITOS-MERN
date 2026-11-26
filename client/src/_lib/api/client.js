import axios from "axios";
import { getSession, signOut } from "next-auth/react";
import { toast } from "sonner";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Single shared axios instance. Every service in src/_lib/api/* imports this.
// 20 s rather than 8 s: the API runs on Render's free tier, where a cold
// service can take well over ten seconds to answer its first request.
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

/**
 * Render's free tier sleeps, and the first request after that can take well
 * over ten seconds. Four seconds of a blank screen with no explanation reads
 * as broken, so say what is happening — once, through the Toaster that is
 * already mounted, with no new styling.
 *
 * Only the first slow request says it. A cold start wakes the whole service,
 * so once one request is through the rest are fast, and a toast per pending
 * call would stack up a wall of identical notices.
 */
let wakeNoticeShown = false;
let inFlight = 0;
let wakeTimer = null;

function noteRequestStarted() {
  inFlight += 1;
  // One timer at a time: a dashboard firing a dozen requests at once should
  // produce one notice, not a dozen.
  if (wakeNoticeShown || wakeTimer) return;

  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    // Still waiting after four seconds: this is a cold start, not a blip.
    if (inFlight > 0 && !wakeNoticeShown) {
      wakeNoticeShown = true;
      toast.loading("Waking the server…", {
        id: "cold-start",
        description: "The free hosting tier sleeps when idle. This takes a few seconds.",
      });
    }
  }, 4000);
}

function noteRequestFinished() {
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight > 0) return;

  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  if (wakeNoticeShown) {
    toast.dismiss("cold-start");
    // Reset, so this is "once per cold start" rather than once per page
    // load: the service sleeps again after a quarter of an hour idle, and
    // the second wait deserves the same explanation as the first.
    wakeNoticeShown = false;
  }
}

// Automatically attach the JWT token to outgoing request headers in the browser environment
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    noteRequestStarted();
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
  (response) => {
    if (typeof window !== "undefined") noteRequestFinished();
    return response;
  },
  async (error) => {
    const config = error.config;
    if (typeof window !== "undefined") noteRequestFinished();

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
