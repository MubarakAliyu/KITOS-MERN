/**
 * Direct API access for the journey specs.
 *
 * The journeys drive the browser for everything a person actually does. These
 * helpers cover the two things around the edges: arranging fixture data a
 * journey needs before it can start (an empty course for the instructor to
 * fill, enrolling the child on it), and reading the database back to check
 * that what the UI claimed really landed.
 *
 * Each call carries a token for the role that is allowed to make it, so
 * nothing here quietly bypasses a permission the UI would be subject to.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

/** Signs in against the API and returns the bearer token. */
export async function apiLogin(identifier, password) {
  const response = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identifier, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access) {
    throw new Error(`API login failed for ${identifier}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.access;
}

/**
 * One API call. Throws with the server's own message on failure, so a broken
 * fixture reads as the reason it broke rather than as a later assertion.
 */
export async function api(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return parsed;
}

/** The seeded instructor's user id, which a course is assigned to. */
export async function instructorUserId(adminToken, email) {
  const users = await api(adminToken, "GET", "/admin/users");
  const match = users.find((u) => u.email === email);
  if (!match) throw new Error(`No user with email ${email}`);
  return match.id;
}

/**
 * A child's Student record id.
 *
 * Not the same as their user id: enrolment, attendance and progress all key
 * on the Student record, and the admin user list reports the user.
 */
export async function studentRecordId(instructorToken, admissionNo) {
  const students = await api(instructorToken, "GET", "/instructors/me/students");
  const match = students.find((s) => s.admission_no === admissionNo);
  if (!match) throw new Error(`No student with admission number ${admissionNo}`);
  return match.student_id;
}

/** An empty draft course assigned to an instructor, for them to fill. */
export async function createDraftCourse(adminToken, { title, instructorId }) {
  return api(adminToken, "POST", "/admin/courses", {
    title,
    description: "Created by the end-to-end journey.",
    programme_track: "scratch",
    instructor_id: instructorId,
    price_kobo: 0,
  });
}

/**
 * Publishing is the administrator's call, never the instructor's (ADR-025),
 * so the journey makes it as the admin even though the instructor wrote the
 * content.
 */
export async function publishCourse(adminToken, courseId) {
  return api(adminToken, "POST", `/admin/courses/${courseId}/publish`);
}

export async function enrol(adminToken, { studentId, courseId }) {
  return api(adminToken, "POST", "/admin/enrollments", {
    student_id: studentId,
    course_id: courseId,
  });
}

/** Best effort: a failed clean-up must not fail a journey that passed. */
export async function deleteCourse(adminToken, courseId) {
  try {
    await api(adminToken, "DELETE", `/admin/courses/${courseId}`);
  } catch {
    // The course may already be gone, or the run may have failed before it
    // existed. Either way there is nothing useful to do here.
  }
}

export async function cancelSession(token, sessionId) {
  try {
    await api(token, "POST", `/sessions/${sessionId}/cancel`, {
      reason: "End-to-end journey clean-up",
    });
  } catch {
    // As above.
  }
}

/**
 * A date and time, in the browser's own timezone, for the session form.
 *
 * The form reads a `date` and a `time` field and composes them as local time,
 * so these must be local strings — a UTC ISO string would schedule the class
 * an hour out in Lagos and the journey would never see it go live.
 */
export function localDateTimeFields(when) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
}
