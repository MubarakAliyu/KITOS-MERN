// Shared helpers for the Live Sessions / Online Classes feature. Every session
// component imports from here so status colours, labels, and formatting stay
// consistent across the dashboard, sessions list, detail page, and recordings.

import { Radio, Clock, CheckCircle, XCircle } from "lucide-react";

/**
 * Visual metadata per session status. Colours are hard brand values (the same
 * ones used elsewhere in the app) while surrounding surfaces use CSS tokens so
 * dark mode stays intact.
 */
export const SESSION_STATUS_META = {
  live: {
    label: "Live",
    color: "#DC2626",
    icon: Radio,
    dot: true,
  },
  scheduled: {
    label: "Upcoming",
    color: "#F59E0B",
    icon: Clock,
    dot: false,
  },
  completed: {
    label: "Completed",
    color: "#6B7280",
    icon: CheckCircle,
    dot: false,
  },
  cancelled: {
    label: "Cancelled",
    color: "#EF4444",
    icon: XCircle,
    dot: false,
  },
};

export function statusMeta(status) {
  return SESSION_STATUS_META[status] ?? SESSION_STATUS_META.scheduled;
}

/** "60 min" / "1h 30min" for a duration expressed in minutes. */
export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
}

/** Minutes elapsed since a session started (>= 0). */
export function minutesSince(scheduledAt) {
  const diff = Date.now() - new Date(scheduledAt).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

/** Minutes remaining in a live session, clamped to [0, duration]. */
export function minutesRemaining(scheduledAt, durationMinutes) {
  const elapsed = minutesSince(scheduledAt);
  return Math.max(0, (Number(durationMinutes) || 0) - elapsed);
}

/**
 * Extracts the YouTube video id from a watch/share/embed URL. Returns null if
 * the URL isn't a recognisable YouTube link.
 */
export function youtubeId(url) {
  if (!url) return null;
  const patterns = [
    /[?&]v=([^&]+)/, // youtube.com/watch?v=ID
    /youtu\.be\/([^?&/]+)/, // youtu.be/ID
    /youtube\.com\/embed\/([^?&/]+)/, // youtube.com/embed/ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Builds a YouTube embed URL from any watch/share URL, or null. */
export function youtubeEmbedUrl(url) {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Google Calendar "add event" template URL — no backend needed. Opens in a new
// tab pre-filled with the session details so students can save it to their own
// calendar. (Swap for a real .ics feed once the backend exists.)
function toCalStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(session) {
  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + (Number(session.duration_minutes) || 60) * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: session.title ?? "Live Session",
    dates: `${toCalStamp(start)}/${toCalStamp(end)}`,
    details: [
      session.course ? `Course: ${session.course}` : "",
      session.instructor_name ? `Instructor: ${session.instructor_name}` : "",
      session.description ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
