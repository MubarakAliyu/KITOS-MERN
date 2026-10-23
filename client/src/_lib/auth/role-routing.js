// Maps a User.role to the dashboard path that role should land on.

const ROLE_PATHS = {
  admin: "/admin",
  instructor: "/instructor",
  student: "/student",
  parent: "/parent",
};

const FALLBACK_PATH = "/login";

/**
 * @param {string|undefined|null} role
 * @returns {string} dashboard path or `/login` when role is missing/unknown
 */
export function roleToPath(role) {
  if (!role) return FALLBACK_PATH;
  return ROLE_PATHS[role] ?? FALLBACK_PATH;
}
