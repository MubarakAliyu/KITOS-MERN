"use client";

import { useNotificationStore } from "@/_store/notificationStore";

// Client-side session notification emitter. Session events are frontend-only
// mock (see sessions.js), so instead of POSTing to a backend feed we push a
// typed notification straight into the shared notification store — it shows up
// in the bell dropdown + the role's notifications page immediately.
//
// Types (icons/colours are registered in the display maps):
//   session_live · session_starting_soon · session_cancelled
//   session_recording_added · session_scheduled

const TEMPLATES = {
  session_live: {
    title: "Session is Live",
    message: (d) => `${d.title} is live now — join in!`,
  },
  session_starting_soon: {
    title: "Session Starting Soon",
    message: (d) => `${d.title} starts ${d.when ?? "soon"}`,
  },
  session_cancelled: {
    title: "Session Cancelled",
    message: (d) => `${d.title} was cancelled${d.reason ? ` — ${d.reason}` : ""}`,
  },
  session_recording_added: {
    title: "Recording Available",
    message: (d) => `The recording for ${d.title} is now available`,
  },
  session_scheduled: {
    title: "New Session Scheduled",
    message: (d) => `${d.title}${d.when ? ` · ${d.when}` : ""} has been scheduled`,
  },
};

function linkFor(role, type, data) {
  const base =
    role === "instructor"
      ? "/instructor/sessions"
      : role === "admin"
      ? "/admin/sessions"
      : "/student/sessions";
  // Instructor links always target the management list; a cancelled session has
  // no meaningful detail view, so those go to the list too.
  if (role === "instructor" || type === "session_cancelled") return base;
  return data.id ? `${base}/${data.id}` : base;
}

/**
 * Emits a session notification into the store. De-duplicates by a stable id
 * (`type-sessionId`) so the same event re-firing on re-render / navigation
 * doesn't stack duplicates in the feed.
 *
 * @param {string} type   One of the TEMPLATES keys.
 * @param {object} data   { id, title, when?, reason? }
 * @param {{ role?: 'student'|'instructor'|'admin' }} [opts]
 */
export function emitSessionNotification(type, data = {}, { role = "student" } = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl) return;

  const id = `${type}-${data.id ?? Date.now()}`;
  const store = useNotificationStore.getState();
  if (store.notifications.some((n) => n.id === id)) return; // already emitted

  store.addNotification({
    id,
    type,
    title: tpl.title,
    message: tpl.message(data),
    link: linkFor(role, type, data),
    is_read: false,
    created_at: new Date().toISOString(),
  });
}
