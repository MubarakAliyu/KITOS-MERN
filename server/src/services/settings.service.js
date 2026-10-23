import mongoose from "mongoose";
import { Setting } from "../models/Setting.js";
import { User } from "../models/User.js";
import { applyOverrides, getMatrix } from "../config/permissions.js";
import { logger } from "../lib/logger.js";
import { ADMIN_SECTIONS } from "../config/constants.js";

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
 * Saves per-administrator dashboard section toggles (ADR-021).
 *
 * This is what the roles-and-permissions screen actually sends:
 * `{ "<adminUserId>": { dashboard: true, users: false, … } }`. It controls
 * which sections that administrator sees, and nothing else — authorisation
 * stays with the role matrix, which this cannot touch. Unknown section keys
 * and ids that are not active administrators are reported back rather than
 * stored.
 *
 * @param {Record<string, Record<string, boolean>>} byUser
 */
export async function saveAdminSections(byUser) {
  const applied = [];
  const ignored = [];

  for (const [userId, sections] of Object.entries(byUser ?? {})) {
    if (!mongoose.isValidObjectId(userId) || typeof sections !== "object" || sections === null) {
      ignored.push(userId);
      continue;
    }

    const admin = await User.findOne({ _id: userId, role: "admin" }).select("_id");
    if (!admin) {
      ignored.push(userId);
      continue;
    }

    // Keep only the sections the UI actually offers, coerced to booleans, so
    // a stray key cannot accumulate on the document.
    const cleaned = {};
    for (const key of ADMIN_SECTIONS) {
      if (key in sections) cleaned[key] = Boolean(sections[key]);
    }

    if (Object.keys(cleaned).length === 0) {
      ignored.push(userId);
      continue;
    }

    await User.updateOne({ _id: admin._id }, { $set: { admin_sections: cleaned } });
    applied.push(userId);
  }

  if (ignored.length > 0) {
    logger.warn({ ignored }, "Ignored unknown ids while saving admin sections");
  }

  return { applied, ignored };
}

/**
 * Decides which of the two shapes a permissions payload is in.
 *
 * The endpoint serves two callers with the same name for different things:
 * the PRD's role matrix (`{ "users.manage": ["admin"] }`) and the roles
 * screen's per-administrator toggles (`{ "<id>": { dashboard: true } }`).
 * Telling them apart by their keys is unambiguous — a permission key is a
 * dotted name from a fixed list, an id is 24 hex characters — and avoids
 * making the client send a discriminator it does not currently send.
 */
export function classifyPermissionsPayload(payload) {
  const keys = Object.keys(payload ?? {});
  if (keys.length === 0) return "empty";

  const ids = keys.filter((key) => mongoose.isValidObjectId(key));

  // Every key an id: the roles screen's per-administrator sections.
  if (ids.length === keys.length) return "admin_sections";

  // Some but not all: genuinely ambiguous, and far more likely a bug in the
  // caller than an intent worth guessing at.
  if (ids.length > 0) return "mixed";

  // Otherwise treat it as the role matrix. Deliberately not "every key must
  // be a known permission": a single mistyped key should be reported in
  // `ignored` alongside the ones that applied, not reject the whole save.
  return "matrix";
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
