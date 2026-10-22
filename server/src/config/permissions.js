import { ROLES } from "./constants.js";

/**
 * The one permission matrix (PRD §10.1).
 *
 * A tick in the PRD table that reads "✔ (assigned)", "✔ (own)", "✔ (child's)"
 * or "✔ (enrolled)" grants the permission here and leaves the narrowing to an
 * ownership check in the service. The matrix answers "may this role ever do
 * this?"; the service answers "to this particular record?". Both must pass —
 * UI hiding is not security.
 */
export const DEFAULT_PERMISSIONS = {
  "users.manage": ["admin"],
  "course.create": ["admin"],
  "course.publish": ["admin"],
  "course.edit": ["admin", "instructor"],
  "content.read": ["admin", "instructor", "parent", "student"],
  "lesson.complete": ["student"],
  "quiz.submit": ["student"],
  "assignment.submit": ["student"],
  "submission.review": ["admin", "instructor"],
  "session.manage": ["admin", "instructor"],
  "attendance.mark": ["admin", "instructor"],
  "recording.add": ["admin", "instructor"],
  "session.view": ["admin", "instructor", "parent", "student"],
  "child.manage": ["parent"],
  "payment.make": ["parent"],
  "payment.view": ["admin", "parent"],
  "chat.use": ["admin", "instructor", "parent", "student"],
  "chat.monitor": ["admin"],
  "analytics.view": ["admin"],
  "settings.manage": ["admin"],
  "audit.view": ["admin"],
};

export const PERMISSION_KEYS = Object.freeze(Object.keys(DEFAULT_PERMISSIONS));

/**
 * Live matrix: the defaults with any admin overrides from the settings
 * singleton merged over them. Replaced wholesale by `applyOverrides` so a
 * reader never sees a half-applied matrix.
 */
let matrix = structuredClone(DEFAULT_PERMISSIONS);

/**
 * Merges stored overrides (settings.permissions) onto the defaults.
 *
 * Shape: `{ "<permission.key>": ["admin", "instructor"] }`. Unknown keys and
 * unknown roles are dropped rather than trusted — the override document is
 * admin-editable data, and a typo must not invent a permission or silently
 * widen one. `admin` is always retained on every key it holds by default so a
 * bad save cannot lock every administrator out of the platform.
 *
 * @param {Record<string, string[]>} [overrides]
 * @returns {{ applied: string[], ignored: string[] }}
 */
export function applyOverrides(overrides) {
  const next = structuredClone(DEFAULT_PERMISSIONS);
  const applied = [];
  const ignored = [];

  for (const [key, roles] of Object.entries(overrides ?? {})) {
    if (!Object.hasOwn(DEFAULT_PERMISSIONS, key) || !Array.isArray(roles)) {
      ignored.push(key);
      continue;
    }

    const cleaned = [...new Set(roles.filter((r) => ROLES.includes(r)))];

    // Never let an override strip admin from a permission it holds by default.
    if (DEFAULT_PERMISSIONS[key].includes("admin") && !cleaned.includes("admin")) {
      cleaned.push("admin");
    }

    next[key] = cleaned;
    applied.push(key);
  }

  matrix = next;
  return { applied, ignored };
}

/** Resets to the compiled-in defaults. Used by tests and at boot. */
export function resetPermissions() {
  matrix = structuredClone(DEFAULT_PERMISSIONS);
}

/**
 * May this role ever perform this action?
 * An unknown permission key is denied — a typo must fail closed, not open.
 * @param {string} role
 * @param {string} key
 */
export function can(role, key) {
  const allowed = matrix[key];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** The matrix as currently in force, for GET /platform/settings and tests. */
export function getMatrix() {
  return structuredClone(matrix);
}

/** Every permission a role currently holds — handy for the admin UI. */
export function permissionsForRole(role) {
  return PERMISSION_KEYS.filter((key) => can(role, key));
}
