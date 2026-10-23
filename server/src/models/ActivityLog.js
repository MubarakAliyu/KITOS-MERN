import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * Append-only audit trail (PRD §8.2, §10).
 *
 * `actor_name` and `actor_role` are denormalised on purpose: the admin
 * activity-log screen shows who did what, and that record must survive the
 * actor being renamed or deleted. An audit row that changes retrospectively
 * is not an audit row.
 */
const activityLogSchema = new mongoose.Schema(
  {
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actor_role: { type: String, required: true },
    actor_name: { type: String, default: "System" },
    action: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    target_type: { type: String, default: null },
    target_id: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { collection: "activity_logs" }
);

activityLogSchema.plugin(serializePlugin);

activityLogSchema.index({ created_at: -1 });
activityLogSchema.index({ actor_id: 1, created_at: -1 });
activityLogSchema.index({ action: 1, created_at: -1 });

/**
 * The shape the admin activity-log screen reads, which names the fields
 * differently from the collection (`user_name`, `timestamp`).
 */
activityLogSchema.methods.toAdminJSON = function toAdminJSON() {
  return {
    id: String(this._id),
    user_name: this.actor_name,
    user_role: this.actor_role,
    action: this.action,
    description: this.description,
    ip: this.ip,
    timestamp: this.created_at?.toISOString() ?? null,
  };
};

export const ActivityLog =
  mongoose.models.ActivityLog ??
  mongoose.model("ActivityLog", activityLogSchema);
