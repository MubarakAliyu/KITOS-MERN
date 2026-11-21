// Live Sessions / Online Classes.
//
// Every function here now calls the KITOS API. This file used to be a
// client-side mock, because the old PHP backend had no /sessions route; Batch
// 2 built those routes, so `buildMockSessions()` and the mutable in-memory
// stores are gone.
//
// Every exported name and return shape is unchanged, so no component needed
// editing. Where a screen expects a composed view the API does not return
// verbatim — the admin overview's per-instructor and per-course rollups, the
// attendance report's per-student rows — the composition still happens here,
// over real session data instead of fixtures.
//
// The identical mock still lives in src/_lib/mocks/handlers.js for MSW mode.

import { apiClient } from "./client";

/**
 * Session status is computed by the server from `scheduled_at` and
 * `duration_minutes`, using the same rule this file used to apply locally, so
 * a session that reads as "live" here is live there too. Kept exported
 * because components import it to re-derive status between polls.
 */
export function computeStatus(session) {
  if (session.status === "cancelled") return "cancelled";
  const now = Date.now();
  const start = new Date(session.scheduled_at).getTime();
  const end = start + (Number(session.duration_minutes) || 0) * 60000;
  if (now >= start && now <= end) return "live";
  if (now > end) return "completed";
  return "scheduled";
}

/** Every session the signed-in user may see. */
async function fetchSessions(filter) {
  const { data } = await apiClient.get("/sessions", {
    params: filter && filter !== "all" ? { filter } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

// ── Student and shared reads ────────────────────────────────────────────────

export async function getSessions(filter = "all") {
  return fetchSessions(filter);
}

/** A single session, or null when it does not exist or is not visible. */
export async function getSession(id) {
  try {
    const { data } = await apiClient.get(`/sessions/${id}`);
    return data;
  } catch (error) {
    if ([403, 404].includes(error.response?.status)) return null;
    throw error;
  }
}

export async function getLiveSessions() {
  return fetchSessions("live");
}

/** Upcoming sessions, soonest first. */
export async function getUpcomingSessions() {
  const sessions = await fetchSessions("upcoming");
  return sessions.sort(
    (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)
  );
}

/** Completed sessions, most recent first. */
export async function getCompletedSessions() {
  const sessions = await fetchSessions("completed");
  return sessions.sort(
    (a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)
  );
}

// ── Instructor ──────────────────────────────────────────────────────────────

/**
 * Adds the instructor-only fields the management screens read.
 *
 * These used to be invented by the mock. They are derived from real figures
 * now: `total_students` is the enrolment count, `students_attended` the
 * recorded attendance.
 */
function augmentInstructor(session) {
  const live = session.status === "live";
  const completed = session.status === "completed";
  return {
    ...session,
    is_published: true,
    max_students: session.max_students ?? null,
    total_students: session.enrolled_count ?? 0,
    students_joined: completed ? null : live ? session.attended_count ?? 0 : 0,
    students_attended: completed ? session.attended_count ?? 0 : null,
    recording_source: session.recording_url ? "youtube" : null,
    cancellation_reason: session.cancel_reason ?? null,
    computed_status: session.status,
  };
}

export async function getInstructorSessions() {
  const { data } = await apiClient.get("/instructors/me/sessions");
  return (Array.isArray(data) ? data : [])
    .map(augmentInstructor)
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
}

export async function getInstructorSession(id) {
  const session = await getSession(id);
  return session ? augmentInstructor(session) : null;
}

/**
 * The roster for the register.
 *
 * The screen reads `{ session_id, enrolled, roster: [{ id, name, present }] }`,
 * where `present` is a boolean. The API speaks a richer four-state status
 * (present, absent, late, excused), so the two are mapped here rather than
 * changing the screen: late still counts as present in the tick box.
 */
export async function getAttendanceRoster(sessionId) {
  const { data } = await apiClient.get(`/sessions/${sessionId}/roster`);
  const students = data?.students ?? [];

  return {
    session_id: data?.session_id ?? sessionId,
    enrolled: students.length,
    attendance_open: data?.attendance_open ?? false,
    roster: students.map((student) => ({
      id: student.student_id,
      name: student.name,
      admission_no: student.admission_no ?? null,
      present: student.status === "present" || student.status === "late",
      status: student.status,
      method: student.method,
    })),
  };
}

/** Saves the register. Takes the same `[{ id, present }]` the screen builds. */
export async function saveAttendance(sessionId, records) {
  const payload = {
    records: (records ?? []).map((record) => ({
      student_id: record.id ?? record.student_id,
      status: record.present ? "present" : "absent",
    })),
  };

  await apiClient.put(`/sessions/${sessionId}/attendance`, payload);

  const present = payload.records.filter((r) => r.status === "present").length;
  return {
    session_id: sessionId,
    attended: present,
    total: payload.records.length,
  };
}

export async function createSession(data) {
  const { data: created } = await apiClient.post("/sessions", {
    title: data.title,
    description: data.description,
    course_id: data.course_id,
    scheduled_at: data.scheduled_at,
    duration_minutes: data.duration_minutes,
    session_number: data.session_number,
    mode: data.mode,
    // The form calls it join_url; the API calls it meeting_url.
    meeting_url: data.meeting_url ?? data.join_url ?? null,
    venue: data.venue ?? null,
    max_students: data.max_students ?? null,
  });
  return augmentInstructor(created);
}

export async function updateSession(id, data) {
  const { data: updated } = await apiClient.put(`/sessions/${id}`, {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.scheduled_at !== undefined ? { scheduled_at: data.scheduled_at } : {}),
    ...(data.duration_minutes !== undefined
      ? { duration_minutes: data.duration_minutes }
      : {}),
    ...(data.mode !== undefined ? { mode: data.mode } : {}),
    ...(data.meeting_url !== undefined || data.join_url !== undefined
      ? { meeting_url: data.meeting_url ?? data.join_url ?? null }
      : {}),
    ...(data.venue !== undefined ? { venue: data.venue } : {}),
    ...(data.max_students !== undefined ? { max_students: data.max_students } : {}),
    ...(data.session_number !== undefined
      ? { session_number: data.session_number }
      : {}),
  });
  return augmentInstructor(updated);
}

export async function cancelSession(id, reason) {
  const { data } = await apiClient.post(`/sessions/${id}/cancel`, { reason });
  return augmentInstructor(data);
}

/**
 * Cancelled sessions, newest first.
 *
 * This used to read a log kept in localStorage, because nothing was
 * persisted. The server records cancellations now, so every device sees the
 * same list.
 */
export async function getSessionCancellations() {
  const { data } = await apiClient.get("/sessions/cancellations");
  return (Array.isArray(data) ? data : []).map((session) => ({
    ...session,
    cancellation_reason: session.cancel_reason ?? null,
  }));
}

export async function rescheduleSession(id, scheduledAt) {
  const { data } = await apiClient.post(`/sessions/${id}/reschedule`, {
    scheduled_at: scheduledAt,
  });
  return augmentInstructor(data);
}

export async function addRecording(id, { url, source }) {
  await apiClient.post(`/sessions/${id}/recordings`, { url, source });
  const session = await getSession(id);
  return session ? augmentInstructor(session) : null;
}

/** Every recording the user may see, for the recordings pages. */
export async function getRecordings() {
  const { data } = await apiClient.get("/recordings");
  return Array.isArray(data) ? data : [];
}

/**
 * Attendance for one session, in the summary shape the detail page reads.
 */
export async function getSessionAttendance(id) {
  const { data } = await apiClient.get(`/sessions/${id}/attendance`);
  const rows = Array.isArray(data) ? data : [];

  const present = rows.filter(
    (row) => row.status === "present" || row.status === "late"
  );

  return {
    session_id: id,
    attended: present.length,
    total: rows.length,
    percent: rows.length
      ? Math.round((present.length / rows.length) * 100)
      : 0,
    rows: rows.map((row) => ({
      student_id: row.student_id,
      student_name: row.student_name,
      joined_at: row.marked_at,
      status: row.status,
      method: row.method,
      minutes: null,
      percent: row.status === "absent" ? 0 : 100,
    })),
  };
}

// ── QR check-in ─────────────────────────────────────────────────────────────

/** A 60-second token the instructor displays as a QR code. */
export async function getSessionQrToken(sessionId) {
  const { data } = await apiClient.post(`/sessions/${sessionId}/qr-token`);
  return data;
}

/**
 * Checks the student in.
 * `method: "auto"` is used when they open an online class's meeting link;
 * `"qr"` carries a scanned token.
 */
export async function checkInToSession(sessionId, { token, method = "qr" } = {}) {
  const { data } = await apiClient.post(`/sessions/${sessionId}/check-in`, {
    token,
    method,
  });
  return data;
}

// ── Admin oversight ─────────────────────────────────────────────────────────

/**
 * Platform-wide overview.
 *
 * The rollups are still composed here, over the real session list, so the
 * screen's shape is untouched.
 */
export async function getAdminSessionsOverview() {
  const { data } = await apiClient.get("/admin/sessions");
  const all = Array.isArray(data) ? data : [];

  const live = all.filter((s) => s.status === "live");
  const upcoming = all.filter((s) => s.status === "scheduled");
  const completed = all.filter((s) => s.status === "completed");

  const instructors = [
    ...new Map(
      all.map((s) => [
        s.instructor_id,
        {
          id: s.instructor_id,
          name: s.instructor_name,
          session_count: all.filter((x) => x.instructor_id === s.instructor_id).length,
          upcoming_count: upcoming.filter(
            (x) => x.instructor_id === s.instructor_id
          ).length,
        },
      ])
    ).values(),
  ];

  const courses = [
    ...new Map(
      all.map((s) => [
        s.course_name,
        {
          name: s.course_name,
          session_count: all.filter((x) => x.course_name === s.course_name).length,
          has_recording_gap: completed.some(
            (x) => x.course_name === s.course_name && !x.recording_url
          ),
        },
      ])
    ).values(),
  ];

  const totalEnrolled = completed.reduce(
    (sum, s) => sum + (s.enrolled_count || 0),
    0
  );
  const totalAttended = completed.reduce(
    (sum, s) => sum + (s.attended_count || 0),
    0
  );
  const avgAttendance =
    totalEnrolled > 0 ? Math.round((totalAttended / totalEnrolled) * 100) : 0;

  const missingRecordings = completed.filter((s) => !s.recording_url);

  return {
    stats: {
      total_sessions: all.length,
      live_now: live.length,
      upcoming: upcoming.length,
      completed: completed.length,
      avg_attendance_pct: avgAttendance,
      missing_recordings: missingRecordings.length,
    },
    sessions: [...all].sort(
      (a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)
    ),
    instructors,
    courses,
    missing_recordings: missingRecordings,
  };
}

/**
 * The full session list with the screen's combinable filters.
 *
 * Status, instructor and course go to the API; the free-text search and the
 * sort stay here, because they are presentation and the list is small.
 */
export async function getAdminAllSessions(filters = {}) {
  const params = {};
  if (filters.status && filters.status !== "all") params.status = filters.status;
  if (filters.instructor_id) params.instructor_id = filters.instructor_id;

  const { data } = await apiClient.get("/admin/sessions", { params });
  let sessions = Array.isArray(data) ? data : [];

  if (filters.course_name) {
    sessions = sessions.filter((s) => s.course_name === filters.course_name);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.course_name ?? "").toLowerCase().includes(q) ||
        (s.instructor_name ?? "").toLowerCase().includes(q)
    );
  }

  const sortBy = filters.sort || "date_desc";
  return sessions.sort((a, b) =>
    sortBy === "date_asc"
      ? new Date(a.scheduled_at) - new Date(b.scheduled_at)
      : new Date(b.scheduled_at) - new Date(a.scheduled_at)
  );
}

/**
 * Per-session attendance detail for the admin report.
 *
 * The rows are real marks now. The mock invented join and leave times from a
 * fixed roster; the API records who was marked, how and when, so the columns
 * it cannot know — minutes watched, a leave time — are null rather than
 * fabricated.
 */
export async function getAdminAttendanceReport() {
  const [sessionsResponse, reportResponse] = await Promise.all([
    apiClient.get("/admin/sessions", { params: { status: "completed" } }),
    apiClient.get("/admin/sessions/attendance-report"),
  ]);

  const sessions = Array.isArray(sessionsResponse.data)
    ? sessionsResponse.data
    : [];
  const report = reportResponse.data ?? {};

  const details = await Promise.all(
    sessions
      .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
      .map(async (session) => {
        const { data } = await apiClient.get(
          `/sessions/${session.id}/attendance`
        );
        const marks = Array.isArray(data) ? data : [];
        const attended = marks.filter(
          (m) => m.status === "present" || m.status === "late"
        ).length;

        return {
          session_id: session.id,
          session_title: session.title,
          course_name: session.course_name,
          instructor_name: session.instructor_name,
          date: session.scheduled_at,
          duration_minutes: session.duration_minutes,
          enrolled_count: session.enrolled_count ?? 0,
          attended_count: attended,
          attendance_pct: session.enrolled_count
            ? Math.round((attended / session.enrolled_count) * 100)
            : 0,
          students: marks.map((mark) => ({
            id: mark.student_id,
            name: mark.student_name,
            joined_at: mark.marked_at,
            left_at: null,
            duration_minutes: null,
            attendance_pct: mark.status === "absent" ? 0 : 100,
            status:
              mark.status === "present" || mark.status === "late"
                ? "attended"
                : mark.status,
            method: mark.method,
          })),
        };
      })
  );

  // The overall rates the server computed, for any screen that wants them.
  details.overall = report.overall_rate ?? 0;
  return details;
}
