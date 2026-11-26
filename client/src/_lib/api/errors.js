/**
 * Turning an API error into something worth showing a person.
 *
 * Every write form used to answer `catch { toast.error("Couldn't create
 * user") }`. When nine of sixteen admin writes were failing validation in
 * production, that is all anyone saw — the server was naming the exact field
 * and the exact reason in its response, and the UI threw it away and
 * substituted a sentence that could not be acted on. The errors were
 * diagnosed by reading the network tab, which is not something to ask of the
 * person running a school.
 *
 * The API's shape (docs/API.md): `{ error, reason?, fields? }`, where
 * `fields` maps a field name to a message meant for exactly this purpose.
 */

/** Field names as a person would say them, where the key is not obvious. */
const FIELD_LABELS = {
  programme_track: "Programme track",
  parent_id: "Parent",
  instructor_id: "Instructor",
  course_id: "Course",
  module_id: "Module",
  scheduled_at: "Date and time",
  meeting_url: "Meeting link",
  join_url: "Meeting link",
  max_students: "Maximum students",
  duration_minutes: "Duration",
  payment_type: "Payment type",
  admission_no: "Admission number",
  password: "Password",
  // `body` is Zod's own key for "the object itself" — an unrecognised field.
  // It names a mismatch between this client and the API, which is a bug
  // rather than something the user typed wrongly, so it is labelled plainly.
  body: "Request",
};

const label = (key) =>
  FIELD_LABELS[key] ??
  key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * The most useful sentence available for `error`, falling back to `fallback`.
 *
 * Field messages win over the generic one, because "Programme track: A
 * programme track is required" tells someone what to do and "Validation
 * failed" does not. At most three are shown: a toast nobody can read is no
 * better than the generic message it replaced, and the form highlights the
 * rest anyway.
 */
export function apiErrorMessage(error, fallback = "Something went wrong") {
  const data = error?.response?.data;
  if (!data) {
    // No response at all — the request never arrived.
    return error?.message === "Network Error"
      ? "Could not reach the server. Check your connection and try again."
      : fallback;
  }

  const fields = data.fields;
  if (fields && typeof fields === "object") {
    const parts = Object.entries(fields)
      .filter(([, message]) => typeof message === "string" && message)
      .map(([key, message]) =>
        // A message that already names its field reads badly prefixed with
        // it again: "Email: An email address is required" is worse than the
        // message alone.
        message.toLowerCase().includes(key.replace(/_/g, " ").toLowerCase())
          ? message
          : `${label(key)}: ${message}`
      );

    if (parts.length > 0) {
      const shown = parts.slice(0, 3).join(" · ");
      return parts.length > 3 ? `${shown} (+${parts.length - 3} more)` : shown;
    }
  }

  if (typeof data.reason === "string" && data.reason) return data.reason;
  if (typeof data.error === "string" && data.error) return data.error;
  return fallback;
}

/**
 * Field errors keyed for react-hook-form's `setError`, so the inputs
 * themselves light up rather than only the toast.
 */
export function apiFieldErrors(error) {
  const fields = error?.response?.data?.fields;
  if (!fields || typeof fields !== "object") return {};

  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key, message]) => key !== "body" && typeof message === "string"
    )
  );
}
