import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A persisted, per-user notification (PRD §8.2).
 *
 * The model exists in Batch 1 because account events already produce
 * notifications (a parent adding a child notifies the admin). The REST routes
 * and the Socket.IO push arrive in Batch 3.
 */
const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, default: "" },
  link: { type: String, default: null },
  is_read: { type: Boolean, default: false },
});

notificationSchema.plugin(serializePlugin);

notificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });

export const Notification =
  mongoose.models.Notification ??
  mongoose.model("Notification", notificationSchema);
