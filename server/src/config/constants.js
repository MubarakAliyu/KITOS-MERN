// Shared enumerations and tuning constants. Values the frontend sees must
// match client/src/_lib/mocks/handlers.js exactly.

export const ROLES = ["admin", "instructor", "parent", "student"];

export const LANGUAGES = ["en", "ha"];

/**
 * Programme tracks: seed values and the in-memory registry.
 *
 * Tracks used to be this list and nothing else — hard-coded here, hard-coded
 * again in four React forms, and enforced as a Mongoose enum on three models.
 * Opening a new track meant a code change and a deploy, which is the wrong
 * shape for something a centre manager decides.
 *
 * They are rows in `tracks` now (see `models/Track.js`). This list is what
 * the seed creates and what the registry falls back to before the database
 * has been read, so a serializer called during boot still renders a label
 * rather than a slug.
 */
export const PROGRAMME_TRACKS = [
  "scratch",
  "web-development",
  "robotics",
  "advanced",
];

/** Display labels for the seeded tracks. */
export const PROGRAMME_TRACK_LABELS = {
  scratch: "Scratch Programming",
  "web-development": "Web Development",
  robotics: "Robotics",
  advanced: "Advanced Track",
};

/**
 * slug → label for every track the database holds.
 *
 * Primed from `tracks` at boot and re-primed after every track write, by
 * `services/track.service.js`. It is a cache, not the source of truth: the
 * service checks the collection before accepting a track on a course or a
 * student. Its job is to keep `toTrackLabel` synchronous, because it is
 * called from inside a dozen serializers and a Mongoose instance method.
 */
let trackRegistry = new Map(
  PROGRAMME_TRACKS.map((slug) => [slug, PROGRAMME_TRACK_LABELS[slug]])
);

/**
 * Replaces the registry with what the database holds.
 *
 * @param {Array<{ slug: string, name: string }>} tracks
 */
export function setTrackRegistry(tracks) {
  trackRegistry = new Map(tracks.map((t) => [t.slug, t.name]));
}

/** Every slug the registry knows, in insertion order. */
export function knownTrackSlugs() {
  return [...trackRegistry.keys()];
}

/** Turns a name into the slug stored for it. */
export function trackNameToSlug(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Accepts a slug or any label a form sends; returns the slug, or undefined.
 *
 * The retained forms submit human labels ("Web Development") because the mock
 * fixtures did, so both are matched — exactly first, then by label, then by
 * prefix for near-misses like "Robotics Basics".
 */
export function toTrackSlug(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const slug = trackNameToSlug(raw);
  if (trackRegistry.has(slug)) return slug;

  const byLabel = [...trackRegistry.entries()].find(
    ([, label]) => String(label).toLowerCase() === raw.toLowerCase()
  );
  if (byLabel) return byLabel[0];

  // "Robotics Basics", "Advanced", "Scratch" and similar near-misses.
  return [...trackRegistry.keys()].find(
    (t) => slug.startsWith(t) || t.startsWith(slug)
  );
}

/** Slug back to the label the frontend expects to render. */
export function toTrackLabel(slug) {
  return trackRegistry.get(slug) ?? PROGRAMME_TRACK_LABELS[slug] ?? slug ?? null;
}

export const TRACK_STATUSES = ["active", "archived"];

/**
 * The kinds of lesson the editor can author.
 *
 * `client/src/_components/instructor/AddLessonModal.jsx` and the content-type
 * picker in `EditLessonModal` offer exactly these four. The stored enum used
 * to be `["video", "text"]`, so choosing File or Link failed validation.
 */
export const LESSON_CONTENT_TYPES = ["video", "text", "link", "file"];

export const STUDENT_STATUSES = ["pending", "active"];

/** Admission numbers: KIT/YY/NNN, widening to four digits past 999. */
export const ADMISSION_NO_PATTERN = /^KIT\/\d{2}\/\d{3,4}$/i;

/** Minimum password policy (PRD §10): 8+ chars with a letter and a number. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE =
  /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_RULE_MESSAGE =
  "Password must be at least 8 characters and include a letter and a number";

export const BCRYPT_ROUNDS = 12;

/** Password-reset tokens: SHA-256 hashed, single use, 30 minutes (PRD §10). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Africa/Lagos is UTC+1 year-round (no DST), so admission years are stable. */
export const DISPLAY_TIME_ZONE = "Africa/Lagos";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

/** Audited after this many failures inside the window (Batch 1 Part E). */
export const LOGIN_FAILURE_AUDIT_THRESHOLD = 5;
export const LOGIN_FAILURE_AUDIT_WINDOW_MS = 15 * 60 * 1000;

export const CONSENT_CURRENT_VERSION = "1.0";

/** Scopes recorded on a parental consent record (NDPA 2023). */
export const CONSENT_SCOPES = [
  "account",
  "progress_tracking",
  "communication",
];

/**
 * Admin dashboard sections an administrator can be given or denied, as the
 * roles-and-permissions screen lists them (PERMISSION_KEYS in
 * `client/src/app/(dashboard)/admin/settings/page.jsx`).
 *
 * These are **not** the role matrix in `config/permissions.js`. That matrix
 * decides what a *role* may do and is what the server enforces; these are
 * per-administrator visibility toggles for the admin UI (ADR-021). Keeping
 * the two apart is deliberate: a navigation preference must never be mistaken
 * for an authorisation decision.
 */
export const ADMIN_SECTIONS = [
  "dashboard",
  "users",
  "courses",
  "analytics",
  "payments",
  "announcements",
  "settings",
];

/** Every section enabled — what a new administrator starts with. */
export function defaultAdminSections() {
  return Object.fromEntries(ADMIN_SECTIONS.map((key) => [key, true]));
}

/**
 * How much each kind of item counts toward course progress (FR10).
 *
 * Equal weights today, which matches what the legacy API did and what the
 * mock fixtures imply. They live here as one constant so the balance can be
 * retuned — "a quiz is worth three lessons" — without touching the queries
 * that count them.
 */
export const PROGRESS_WEIGHTS = {
  lesson: 1,
  quiz: 1,
  assignment: 1,
};

/**
 * The mark a quiz must reach to count toward progress.
 *
 * The legacy API counted a quiz as done merely for having been attempted, so
 * a child could score 10% and still complete the course and collect a
 * certificate. A certificate should mean something.
 */
export const QUIZ_PASS_PERCENTAGE = 50;

/** Session modes (PRD §8.2). */
export const SESSION_MODES = ["online", "physical", "hybrid"];

/** How attendance was captured. */
export const ATTENDANCE_METHODS = ["roster", "qr", "auto"];

/** Attendance states an instructor can record. */
export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];

/** Where a recording is hosted. */
export const RECORDING_SOURCES = ["youtube", "drive", "other"];

/** A QR check-in token is good for 60 seconds (PRD §9.4). */
export const QR_TOKEN_TTL_SECONDS = 60;
