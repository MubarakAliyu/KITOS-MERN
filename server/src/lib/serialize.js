/**
 * The shared `toJSON` behaviour every schema gets (PRD §7.4).
 *
 * The frontend expects `id` as a string, snake_case fields and ISO dates, and
 * must never see a password hash or a reset token. Doing this once as a plugin
 * means a new model cannot forget it.
 */

/** Fields that must never reach a client, on any model. */
const ALWAYS_HIDDEN = [
  "__v",
  "password_hash",
  "token_version",
  "reset_token_hash",
  "reset_token_expires_at",
];

/**
 * Mongoose plugin: `_id` → `id` (string), drop internals, keep field order
 * stable with `id` first.
 * @param {import("mongoose").Schema} schema
 */
export function serializePlugin(schema) {
  const transform = (_doc, ret) => {
    const out = { id: String(ret._id) };

    for (const [key, value] of Object.entries(ret)) {
      if (key === "_id" || ALWAYS_HIDDEN.includes(key)) continue;
      out[key] = value;
    }

    return out;
  };

  schema.set("toJSON", { virtuals: true, versionKey: false, transform });
  schema.set("toObject", { virtuals: true, versionKey: false, transform });

  // `created_at` / `updated_at` rather than Mongoose's camelCase defaults.
  schema.set("timestamps", {
    createdAt: "created_at",
    updatedAt: "updated_at",
  });
}

/**
 * An ObjectId (or anything id-like) as a plain string, or null.
 * Services use this when assembling response objects by hand.
 */
export function idString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

/** A Date as an ISO 8601 string, or null. */
export function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Integer kobo → the naira number the retained frontend renders (ADR-002).
 * Kobo is the stored truth; this is presentation only.
 */
export function koboToNaira(kobo) {
  return Math.round(Number(kobo ?? 0)) / 100;
}

/** Naira in, integer kobo out. No floats survive past this boundary. */
export function nairaToKobo(naira) {
  return Math.round(Number(naira ?? 0) * 100);
}
