import { ActivityLog } from "../models/ActivityLog.js";
import { logger } from "./logger.js";

/**
 * Append-only audit trail (PRD §10, "Audit").
 *
 * Every admin mutation and every security event writes one row. Writes are
 * best-effort by design: an audit failure is logged loudly but must not undo
 * the action the administrator just took, nor leak an internal error to them.
 * Rows are never updated or deleted.
 *
 * @param {object} entry
 * @param {{ id?: string, _id?: any, role?: string, name?: string } | null} [entry.actor]
 *        The signed-in user. Null for an unauthenticated security event.
 * @param {string} entry.action Snake_case verb, e.g. "created_user".
 * @param {string} [entry.description] One human sentence, as the admin
 *        activity-log screen renders it.
 * @param {string} [entry.target_type] e.g. "user", "student", "permissions".
 * @param {string} [entry.target_id]
 * @param {object} [entry.meta] Extra context. Never put a secret here.
 * @param {string} [entry.ip]
 */
export async function logActivity(entry) {
  try {
    const actor = entry.actor ?? null;

    await ActivityLog.create({
      actor_id: actor?.id ?? actor?._id ?? null,
      actor_role: actor?.role ?? "system",
      actor_name: actor?.name ?? "System",
      action: entry.action,
      description: entry.description ?? "",
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
    });
  } catch (err) {
    logger.error(
      { err, action: entry.action },
      "Failed to write activity log entry"
    );
  }
}

/**
 * The client IP, honouring Render's proxy header.
 *
 * `req.ip` is correct once `trust proxy` is set (it is, in app.js), but the
 * header is read first because Render chains proxies and Express only
 * unwraps as many hops as it is told to trust.
 */
export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? null;
}
