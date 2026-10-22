// Live Sessions / Online Classes — CLIENT-SIDE MOCK.
//
// This project's runtime is wired to the real PHP backend (see .env
// NEXT_PUBLIC_API_URL), and that backend has no /sessions route yet. MSW is
// also disabled here. So — for the interface build only — these functions
// return mock data directly instead of hitting the API. Nothing else in the
// app is affected; every other service still talks to PHP as configured.
//
// The identical mock lives in src/_lib/mocks/handlers.js for when Mustafa
// re-enables MSW or ships the PHP endpoints. When the real /sessions route
// exists, swap the bodies below back to `apiClient.get(...)` (the shape is
// already correct) and delete buildMockSessions().
//
// import { apiClient } from "./client"; // ← restore when the API is live

// Statuses are computed from `scheduled_at` at call time so the demo never
// goes stale: the live session is genuinely live, and a session rolls from
// live → completed once its window passes.
function computeStatus(session) {
  if (session.status === "cancelled") return "cancelled";
  const now = Date.now();
  const start = new Date(session.scheduled_at).getTime();
  const end = start + (Number(session.duration_minutes) || 0) * 60000;
  if (now >= start && now <= end) return "live";
  if (now > end) return "completed";
  return "scheduled";
}

// Built fresh on every call so `scheduled_at` stays relative to "now" (dates
// are Date.now() arithmetic, never hardcoded). `status` is the computed value
// so components can key off it directly.
function buildMockSessions() {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const now = Date.now();

  // Tomorrow at 10:00 AM local.
  const tomorrow10 = new Date(now + DAY);
  tomorrow10.setHours(10, 0, 0, 0);

  // Two days from now at 2:00 PM local.
  const inTwoDays14 = new Date(now + 2 * DAY);
  inTwoDays14.setHours(14, 0, 0, 0);

  // Yesterday at 11:00 AM local.
  const yesterday11 = new Date(now - DAY);
  yesterday11.setHours(11, 0, 0, 0);

  // Three days from now at 11:00 AM local.
  const inThreeDays11 = new Date(now + 3 * DAY);
  inThreeDays11.setHours(11, 0, 0, 0);

  const raw = [
    {
      id: "sess1",
      title: "Scratch Programming — Week 3",
      course_id: "c1",
      course: "Scratch Programming for Beginners",
      course_name: "Scratch Programming for Beginners",
      instructor_name: "Mr. Mubarak Aliyu",
      instructor_id: "instructor-1",
      scheduled_at: new Date(now - 5 * MIN).toISOString(), // 5 min ago → live
      duration_minutes: 60,
      status: "live",
      join_url: "#",
      session_number: 3,
      recording_url: null,
      enrolled_count: 5,
      attended_count: 3,
      description:
        "In this week's session, we will build an interactive game using Scratch sprites and events. Students will learn about loops and conditionals.",
    },
    {
      id: "sess2",
      title: "Web Development — Week 5",
      course_id: "c2",
      course: "HTML & CSS Fundamentals",
      course_name: "HTML & CSS Fundamentals",
      instructor_name: "Mr. Mubarak Aliyu",
      instructor_id: "instructor-1",
      scheduled_at: tomorrow10.toISOString(), // tomorrow 10:00 AM
      duration_minutes: 90,
      status: "scheduled",
      join_url: null,
      session_number: 5,
      recording_url: null,
      enrolled_count: 12,
      attended_count: 0,
      description:
        "We continue building responsive layouts with Flexbox and CSS Grid, then style a small portfolio page together.",
    },
    {
      id: "sess3",
      title: "Python Basics — Week 2",
      course_id: "c3",
      course: "Introduction to Python",
      course_name: "Introduction to Python",
      instructor_name: "Mrs. Amina Yusuf",
      instructor_id: "instructor-2",
      scheduled_at: inTwoDays14.toISOString(), // 2 days from now, 2:00 PM
      duration_minutes: 60,
      status: "scheduled",
      join_url: null,
      session_number: 2,
      recording_url: null,
      enrolled_count: 8,
      attended_count: 0,
      description:
        "An introduction to variables, data types, and simple input/output in Python. We'll write our first small program.",
    },
    {
      id: "sess4",
      title: "Scratch Programming — Week 2",
      course_id: "c1",
      course: "Scratch Programming for Beginners",
      course_name: "Scratch Programming for Beginners",
      instructor_name: "Mr. Mubarak Aliyu",
      instructor_id: "instructor-1",
      scheduled_at: new Date(now - 3 * DAY).toISOString(), // 3 days ago
      duration_minutes: 60,
      status: "completed",
      join_url: null,
      session_number: 2,
      recording_url: "https://youtube.com/watch?v=example",
      enrolled_count: 5,
      attended_count: 4,
      description:
        "We explored motion and looks blocks, then animated a sprite walking across the stage using loops.",
    },
    {
      id: "sess5",
      title: "Scratch Programming — Week 1",
      course_id: "c1",
      course: "Scratch Programming for Beginners",
      course_name: "Scratch Programming for Beginners",
      instructor_name: "Mr. Mubarak Aliyu",
      instructor_id: "instructor-1",
      scheduled_at: new Date(now - 7 * DAY).toISOString(), // 1 week ago
      duration_minutes: 60,
      status: "completed",
      join_url: null,
      session_number: 1,
      recording_url: "https://youtube.com/watch?v=example2",
      enrolled_count: 5,
      attended_count: 4,
      description:
        "A gentle tour of the Scratch editor: the stage, sprites, and the block palette. Students created their first project.",
    },
    {
      id: "session-6",
      title: "Robotics — Week 4",
      course_id: "c4",
      course: "Introduction to Robotics",
      course_name: "Introduction to Robotics",
      instructor_name: "Mrs. Amina Yusuf",
      instructor_id: "instructor-2",
      scheduled_at: yesterday11.toISOString(), // yesterday 11:00 AM
      duration_minutes: 90,
      status: "completed",
      join_url: null,
      session_number: 4,
      recording_url: "https://youtube.com/watch?v=example3",
      enrolled_count: 8,
      attended_count: 6,
      description:
        "We wired up motors and sensors, then programmed a line-following robot to navigate a simple track.",
    },
    {
      id: "session-7",
      title: "Robotics — Week 5",
      course_id: "c4",
      course: "Introduction to Robotics",
      course_name: "Introduction to Robotics",
      instructor_name: "Mrs. Amina Yusuf",
      instructor_id: "instructor-2",
      scheduled_at: inThreeDays11.toISOString(), // 3 days from now, 11:00 AM
      duration_minutes: 90,
      status: "scheduled",
      join_url: null,
      session_number: 5,
      recording_url: null,
      enrolled_count: 8,
      attended_count: 0,
      description:
        "Building on line-following, we add obstacle avoidance with ultrasonic sensors and tune the control loop.",
    },
    {
      id: "session-8",
      title: "Web Development — Week 4",
      course_id: "c2",
      course: "HTML & CSS Fundamentals",
      course_name: "HTML & CSS Fundamentals",
      instructor_name: "Mr. Mubarak Aliyu",
      instructor_id: "instructor-1",
      scheduled_at: new Date(now - 5 * DAY).toISOString(), // 5 days ago
      duration_minutes: 90,
      status: "completed",
      join_url: null,
      session_number: 4,
      recording_url: null, // ← missing recording (admin oversight flag)
      enrolled_count: 12,
      attended_count: 9,
      description:
        "We built a multi-section landing page with semantic HTML and a mobile-first responsive layout.",
    },
  ];

  // Overwrite `status` with the time-derived value (also expose it as
  // `computed_status` for callers that prefer the explicit name).
  return raw.map((s) => {
    const computed_status = computeStatus(s);
    return { ...s, status: computed_status, computed_status };
  });
}

// Small artificial latency so loading skeletons render naturally, matching how
// the real API calls behave.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns sessions, optionally filtered by status ("live" | "scheduled" |
 * "completed" | "cancelled"). Defaults to all.
 */
export async function getSessions(filter = "all") {
  await delay(300);
  // return (await apiClient.get("/sessions")).data; // ← when the API is live
  const sessions = buildMockSessions();
  if (filter && filter !== "all") {
    return sessions.filter((s) => s.status === filter);
  }
  return sessions;
}

/** Returns a single session by id, or null. */
export async function getSession(id) {
  await delay(200);
  // return (await apiClient.get(`/sessions/${id}`)).data; // ← when API is live
  return buildMockSessions().find((s) => s.id === id) ?? null;
}

/** Currently-live sessions. */
export async function getLiveSessions() {
  return (await getSessions()).filter((s) => s.status === "live");
}

/** Upcoming (scheduled) sessions, soonest first. */
export async function getUpcomingSessions() {
  return (await getSessions())
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
}

/** Completed sessions, most recent first. */
export async function getCompletedSessions() {
  return (await getSessions())
    .filter((s) => s.status === "completed")
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
}

// ───────────────────────────────────────────────────────────────────────────
// Instructor-facing store (MUTABLE) — powers the session-management UI.
//
// Seeded once from the same mock and augmented with instructor-only fields
// (publish state, capacity, attendance counts). Create / edit / cancel /
// reschedule / add-recording mutate this array in place so the UI reflects
// changes during the session. When the PHP endpoints exist, swap each function
// body for the matching apiClient call.
// ───────────────────────────────────────────────────────────────────────────

let instructorSeq = 100;

function augmentInstructor(s) {
  const completed = s.status === "completed";
  const live = s.status === "live";
  const enrolled = s.enrolled_count ?? 5;
  return {
    ...s,
    is_published: true,
    max_students: 20,
    total_students: enrolled,
    students_joined: completed ? null : live ? s.attended_count ?? 3 : 0,
    students_attended: completed ? s.attended_count ?? 4 : null,
    recording_source: s.recording_url ? "youtube" : null,
    cancellation_reason: null,
  };
}

const INSTRUCTOR_SESSIONS = buildMockSessions().map(augmentInstructor);

// Re-derive status from time on every read (cancelled stays cancelled).
function withStatus(s) {
  const computed_status = s.status === "cancelled" ? "cancelled" : computeStatus(s);
  return { ...s, status: computed_status, computed_status };
}

/** All of the instructor's sessions, newest first. */
export async function getInstructorSessions() {
  await delay(300);
  return INSTRUCTOR_SESSIONS.map(withStatus).sort(
    (a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)
  );
}

/** A single instructor session by id (from the mutable store), or null. */
export async function getInstructorSession(id) {
  await delay(200);
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === id);
  return s ? withStatus(s) : null;
}

// ── Attendance taker (MUTABLE) ──────────────────────────────────────────────
// Per-session present/absent roster the instructor edits live. Seeded from the
// session's enrolled/attended counts on first read, then persisted in memory so
// re-opening the taker keeps the marks. Saving updates the session's counts so
// the manage list + admin reports reflect the new attendance.
const ATTENDANCE_STATE = {};

function sessionById(id) {
  return (
    INSTRUCTOR_SESSIONS.find((s) => s.id === id) ??
    buildMockSessions().find((s) => s.id === id) ??
    null
  );
}

/** Returns the enrolled roster with current present/absent marks for the taker. */
export async function getAttendanceRoster(sessionId) {
  await delay(200);
  const session = sessionById(sessionId);
  if (!session) return { session_id: sessionId, enrolled: 0, roster: [] };

  const enrolled = session.enrolled_count ?? 5;
  if (!ATTENDANCE_STATE[sessionId]) {
    const status = computeStatus(session);
    // Completed sessions start from their recorded attendance; live/scheduled
    // start with everyone unmarked so the instructor checks people in.
    const attended = status === "completed" ? session.attended_count ?? 0 : 0;
    ATTENDANCE_STATE[sessionId] = ADMIN_ROSTER.slice(0, enrolled).map((stu, i) => ({
      id: stu.id,
      name: stu.name,
      present: i < attended,
    }));
  }
  return {
    session_id: sessionId,
    enrolled,
    roster: ATTENDANCE_STATE[sessionId].map((r) => ({ ...r })),
  };
}

/** Persists the taker's marks and syncs attended_count back onto the session. */
export async function saveAttendance(sessionId, records) {
  await delay(250);
  ATTENDANCE_STATE[sessionId] = records.map((r) => ({ ...r }));
  const present = records.filter((r) => r.present).length;
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === sessionId);
  if (s) {
    s.attended_count = present;
    s.students_attended = present;
  }
  return { session_id: sessionId, attended: present, total: records.length };
}

/** Creates a session. `data` carries scheduled_at already combined from the form. */
export async function createSession(data) {
  await delay(300);
  const created = augmentInstructor({
    id: `isess-${instructorSeq++}`,
    status: "scheduled",
    join_url: data.join_url || null,
    recording_url: null,
    ...data,
    course: data.course ?? data.course_name ?? "",
    course_name: data.course_name ?? data.course ?? "",
  });
  created.is_published = !!data.is_published;
  created.max_students = data.max_students ?? null;
  created.students_joined = 0;
  INSTRUCTOR_SESSIONS.unshift(created);
  return withStatus(created);
}

/** Updates an existing session in place. */
export async function updateSession(id, data) {
  await delay(300);
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, data);
  if (data.course) s.course_name = data.course;
  return withStatus(s);
}

/** Marks a session cancelled with an optional reason. Records the cancellation
 * to a cross-session log so the student + admin surfaces can notify their users. */
export async function cancelSession(id, reason) {
  await delay(250);
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  s.status = "cancelled";
  s.cancellation_reason = reason || null;
  recordCancellation(s, reason);
  return withStatus(s);
}

// ── Cross-user cancellation log ─────────────────────────────────────────────
// Notifications are frontend-only, so an instructor's cancel can't reach a
// student/admin session in real time. We persist cancellations to localStorage
// so that when the student or admin next loads, their surface can read the log
// and emit a "session cancelled" notification (with reason) into their bell.
const CANCEL_LOG_KEY = "kit_session_cancellations";

function readCancelLog() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(CANCEL_LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

function recordCancellation(session, reason) {
  if (typeof window === "undefined") return;
  const log = readCancelLog();
  if (log.some((c) => c.id === session.id)) return;
  log.unshift({
    id: session.id,
    title: session.title,
    course: session.course_name ?? session.course ?? "",
    instructor_name: session.instructor_name ?? "",
    reason: reason || null,
    cancelled_at: new Date().toISOString(),
  });
  try {
    window.localStorage.setItem(CANCEL_LOG_KEY, JSON.stringify(log.slice(0, 20)));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Recorded session cancellations (newest first) — read by the student + admin
 * surfaces to notify their users about cancelled sessions. */
export async function getSessionCancellations() {
  return readCancelLog();
}

/** Reschedules a session to a new datetime (ISO string). */
export async function rescheduleSession(id, scheduledAt) {
  await delay(250);
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  s.scheduled_at = scheduledAt;
  if (s.status === "cancelled") s.status = "scheduled"; // reactivate
  return withStatus(s);
}

/** Attaches a recording URL + source to a (completed) session. */
export async function addRecording(id, { url, source }) {
  await delay(250);
  const s = INSTRUCTOR_SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  s.recording_url = url;
  s.recording_source = source || "other";
  return withStatus(s);
}

// Static mock attendance roster — the same set for any completed session in
// this demo. Field names mirror what the PHP attendance endpoint is expected
// to return.
const ATTENDANCE_ROSTER = [
  { student_id: "s1", student_name: "Liam Hassan", joined_at: "2:02 PM", minutes: 55, percent: 92 },
  { student_id: "s2", student_name: "Sara Abdullahi", joined_at: "2:00 PM", minutes: 60, percent: 100 },
  { student_id: "s3", student_name: "Yusuf Bello", joined_at: "2:15 PM", minutes: 40, percent: 67 },
  { student_id: "s4", student_name: "Fatima Musa", joined_at: "2:05 PM", minutes: 50, percent: 83 },
  { student_id: "s5", student_name: "Adam Ibrahim", joined_at: null, minutes: 0, percent: 0 },
];

/** Attendance summary + per-student rows for a completed session (mock). */
export async function getSessionAttendance(id) {
  await delay(250);
  const rows = ATTENDANCE_ROSTER;
  const attended = rows.filter((r) => r.joined_at).length;
  const total = rows.length;
  return {
    session_id: id,
    attended,
    total,
    percent: Math.round((attended / total) * 100),
    rows,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Admin oversight — read-only aggregation across ALL instructors + courses.
// The admin never creates sessions; these functions summarise and filter the
// same mock so the oversight UI (overview, attendance, recordings) can render.
// ───────────────────────────────────────────────────────────────────────────

/** Platform-wide overview: headline stats, the full list, and per-instructor /
 * per-course rollups + the list of completed sessions missing a recording. */
export async function getAdminSessionsOverview() {
  await delay(300);
  const all = buildMockSessions(); // status already computed
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
          upcoming_count: upcoming.filter((x) => x.instructor_id === s.instructor_id).length,
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

  const totalEnrolled = completed.reduce((sum, s) => sum + (s.enrolled_count || 0), 0);
  const totalAttended = completed.reduce((sum, s) => sum + (s.attended_count || 0), 0);
  const avgAttendance = totalEnrolled > 0 ? Math.round((totalAttended / totalEnrolled) * 100) : 0;

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
    sessions: [...all].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
    instructors,
    courses,
    missing_recordings: missingRecordings,
  };
}

/** Full session list with combinable filters (status/instructor/course/search)
 * and sort. All client-side over the mock. */
export async function getAdminAllSessions(filters = {}) {
  await delay(300);
  let sessions = buildMockSessions();

  if (filters.status && filters.status !== "all") {
    sessions = sessions.filter((s) => s.status === filters.status);
  }
  if (filters.instructor_id) {
    sessions = sessions.filter((s) => s.instructor_id === filters.instructor_id);
  }
  if (filters.course_name) {
    sessions = sessions.filter((s) => s.course_name === filters.course_name);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.course_name.toLowerCase().includes(q) ||
        s.instructor_name.toLowerCase().includes(q)
    );
  }

  const sortBy = filters.sort || "date_desc";
  sessions.sort((a, b) =>
    sortBy === "date_asc"
      ? new Date(a.scheduled_at) - new Date(b.scheduled_at)
      : new Date(b.scheduled_at) - new Date(a.scheduled_at)
  );

  return sessions;
}

// Roster used to synthesise per-session attendance rows for the admin report.
const ADMIN_ROSTER = [
  { id: "s1", name: "Liam Hassan" },
  { id: "s2", name: "Sara Abdullahi" },
  { id: "s3", name: "Yusuf Bello" },
  { id: "s4", name: "Fatima Musa" },
  { id: "s5", name: "Adam Ibrahim" },
  { id: "s6", name: "Khadijah Sani" },
  { id: "s7", name: "Omar Dikko" },
  { id: "s8", name: "Aisha Garba" },
];

/** Per-completed-session attendance detail across all instructors. */
export async function getAdminAttendanceReport() {
  await delay(300);
  return buildMockSessions()
    .filter((s) => s.status === "completed")
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
    .map((session) => {
      const enrolled = session.enrolled_count || 5;
      const attended = session.attended_count ?? 3;
      const dur = session.duration_minutes;
      return {
        session_id: session.id,
        session_title: session.title,
        course_name: session.course_name,
        instructor_name: session.instructor_name,
        date: session.scheduled_at,
        duration_minutes: dur,
        enrolled_count: enrolled,
        attended_count: attended,
        attendance_pct: enrolled ? Math.round((attended / enrolled) * 100) : 0,
        students: ADMIN_ROSTER.slice(0, enrolled).map((stu, i) => {
          const present = i < attended;
          const minutes = present ? Math.max(1, dur - 6 + i * 2) : 0;
          const base = new Date(session.scheduled_at).getTime();
          return {
            ...stu,
            joined_at: present ? new Date(base + (i * 2 + 1) * 60000).toISOString() : null,
            left_at: present ? new Date(base + (dur - 5 + i * 2) * 60000).toISOString() : null,
            duration_minutes: minutes,
            attendance_pct: present ? Math.min(100, Math.round((minutes / dur) * 100)) : 0,
            status: present ? "attended" : "absent",
          };
        }),
      };
    });
}
