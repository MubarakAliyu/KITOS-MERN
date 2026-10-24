/**
 * Session status, computed rather than stored (FR12).
 *
 * This is a deliberate port of `computeStatus()` in
 * `client/src/_lib/api/sessions.js`, because the retained screens key off the
 * exact strings it returns. Keeping the rule identical means a session that
 * reads as "live" in the client's mock reads as "live" from the API too.
 *
 * Only `scheduled` and `cancelled` are stored. Deriving the rest at read time
 * means the clock is the single source of truth: no cron job to miss a tick
 * and leave a class "live" overnight.
 */

/**
 * @param {{ status?: string, scheduled_at: Date|string, duration_minutes?: number }} session
 * @param {Date} [now]
 * @returns {"scheduled"|"live"|"completed"|"cancelled"}
 */
export function computeSessionStatus(session, now = new Date()) {
  if (session.status === "cancelled") return "cancelled";

  const current = now.getTime();
  const start = new Date(session.scheduled_at).getTime();
  if (Number.isNaN(start)) return "scheduled";

  const end = start + (Number(session.duration_minutes) || 0) * 60000;

  if (current >= start && current <= end) return "live";
  if (current > end) return "completed";
  return "scheduled";
}

/** When a session ends. */
export function sessionEndsAt(session) {
  const start = new Date(session.scheduled_at).getTime();
  return new Date(start + (Number(session.duration_minutes) || 0) * 60000);
}

/**
 * The window in which attendance may be recorded: from 15 minutes before the
 * start until 24 hours after the end.
 *
 * Early, because instructors mark the register as pupils arrive. Late,
 * because a class that overran or a forgotten register should still be
 * fixable the next day — but not a week later, when nobody remembers who was
 * actually there.
 */
export const ATTENDANCE_OPENS_BEFORE_MS = 15 * 60 * 1000;
export const ATTENDANCE_CLOSES_AFTER_MS = 24 * 60 * 60 * 1000;

export function attendanceWindow(session) {
  const start = new Date(session.scheduled_at).getTime();
  return {
    opens: new Date(start - ATTENDANCE_OPENS_BEFORE_MS),
    closes: new Date(sessionEndsAt(session).getTime() + ATTENDANCE_CLOSES_AFTER_MS),
  };
}

export function isAttendanceOpen(session, now = new Date()) {
  if (session.status === "cancelled") return false;
  const { opens, closes } = attendanceWindow(session);
  return now >= opens && now <= closes;
}
