import { Setting } from "../models/Setting.js";
import { applyOverrides, getMatrix } from "../config/permissions.js";
import { logger } from "../lib/logger.js";

/** Stored `[{ key, roles }]` → the `{ key: roles }` shape the API speaks. */
function overridesToObject(stored) {
  const out = {};
  for (const row of stored ?? []) {
    if (row?.key) out[row.key] = [...(row.roles ?? [])];
  }
  return out;
}

/** The API's object shape → the `[{ key, roles }]` the document stores. */
function overridesToArray(object) {
  return Object.entries(object ?? {}).map(([key, roles]) => ({
    key,
    roles: [...roles],
  }));
}

/**
 * Platform settings and the permission-matrix overrides stored with them.
 * Replaces the legacy `api/settings.json` file (FR19).
 */

/** The settings document as the frontend's settings screen reads it. */
export async function getSettings() {
  const doc = await Setting.getSingleton();
  return {
    id: String(doc._id),
    platform_name: doc.platform_name,
    welcome_message: doc.welcome_message,
    primary_color: doc.primary_color,
    logo_url: doc.logo_url,
    permissions: getMatrix(),
    updated_at: doc.updated_at?.toISOString() ?? null,
  };
}

/**
 * Updates the editable fields. Only the four presentation fields are
 * writable here; the permission matrix has its own endpoint so that changing
 * a platform name cannot quietly rewrite authorisation.
 *
 * @param {{ platform_name?: string, welcome_message?: string,
 *           primary_color?: string, logo_url?: string }} patch
 */
export async function updateSettings(patch) {
  const doc = await Setting.getSingleton();

  for (const key of [
    "platform_name",
    "welcome_message",
    "primary_color",
    "logo_url",
  ]) {
    if (patch[key] !== undefined) doc[key] = patch[key];
  }

  await doc.save();
  return getSettings();
}

/**
 * Saves permission-matrix overrides and puts them straight into force.
 *
 * Unknown keys and unknown roles are reported back rather than stored, so an
 * admin who mistypes a permission sees that it was ignored instead of
 * believing a rule is active when it is not.
 *
 * @param {Record<string, string[]>} overrides
 */
export async function savePermissions(overrides) {
  const doc = await Setting.getSingleton();

  const { applied, ignored } = applyOverrides(overrides);

  // Store only what was accepted, so the stored document and the live matrix
  // can never disagree.
  const matrix = getMatrix();
  const stored = {};
  for (const key of applied) stored[key] = matrix[key];

  doc.permissions = overridesToArray(stored);
  doc.markModified("permissions");
  await doc.save();

  if (ignored.length > 0) {
    logger.warn({ ignored }, "Ignored unknown permission keys while saving");
  }

  return { applied, ignored, permissions: getMatrix() };
}

/**
 * Merges stored overrides into the live matrix at boot.
 *
 * Failure is survivable: the compiled-in defaults are a safe matrix, so the
 * API starts with those rather than refusing to serve.
 */
export async function loadPermissionOverrides() {
  try {
    const doc = await Setting.getSingleton();
    const { applied, ignored } = applyOverrides(overridesToObject(doc.permissions));
    if (applied.length > 0) {
      logger.info(
        { count: applied.length },
        "Applied stored permission overrides"
      );
    }
    if (ignored.length > 0) {
      logger.warn({ ignored }, "Stored permission overrides contain unknown keys");
    }
    return getMatrix();
  } catch (err) {
    logger.error(
      { err },
      "Could not load permission overrides — continuing with the default matrix"
    );
    return getMatrix();
  }
}
