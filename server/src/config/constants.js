// Shared enumerations and tuning constants. Values the frontend sees must
// match client/src/_lib/mocks/handlers.js exactly.

export const ROLES = ["admin", "instructor", "parent", "student"];

export const LANGUAGES = ["en", "ha"];

/**
 * Programme tracks. PRD §8.2 defines the stored enum as slugs; the retained
 * frontend displays and submits human labels ("Web Development") because the
 * mock fixtures use them. We accept either on input and store the slug.
 */
export const PROGRAMME_TRACKS = [
  "scratch",
  "web-development",
  "robotics",
  "advanced",
];

/** Display labels, as the frontend's mock fixtures and forms use them. */
export const PROGRAMME_TRACK_LABELS = {
  scratch: "Scratch Programming",
  "web-development": "Web Development",
  robotics: "Robotics",
  advanced: "Advanced Track",
};

/** Accepts a slug or any label the frontend sends; returns the slug. */
export function toTrackSlug(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const slug = raw.toLowerCase().replace(/\s+/g, "-");
  if (PROGRAMME_TRACKS.includes(slug)) return slug;

  const byLabel = Object.entries(PROGRAMME_TRACK_LABELS).find(
    ([, label]) => label.toLowerCase() === raw.toLowerCase()
  );
  if (byLabel) return byLabel[0];

  // "Robotics Basics", "Advanced", "Scratch" and similar near-misses.
  const byPrefix = PROGRAMME_TRACKS.find(
    (t) => slug.startsWith(t) || t.startsWith(slug)
  );
  return byPrefix;
}

/** Slug back to the label the frontend expects to render. */
export function toTrackLabel(slug) {
  return PROGRAMME_TRACK_LABELS[slug] ?? slug ?? null;
}

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
