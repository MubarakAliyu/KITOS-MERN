import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A live or physical class (PRD §8.2, FR12).
 *
 * Only `scheduled` and `cancelled` are stored. "live" and "completed" are
 * *computed* from `scheduled_at` and `duration_minutes` at read time, exactly
 * as `computeStatus()` does in the client today — storing them would mean a
 * cron job racing the clock, and a session that stayed "live" for ever if the
 * job missed a tick.
 */
const sessionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },

  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true,
  },
  cohort_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cohort",
    default: null,
  },
  instructor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  scheduled_at: { type: Date, required: true, index: true },
  duration_minutes: { type: Number, default: 60, min: 1 },
  session_number: { type: Number, default: null },

  mode: {
    type: String,
    enum: ["online", "physical", "hybrid"],
    default: "online",
  },
  meeting_url: { type: String, default: null },
  venue: { type: String, default: null },
  max_students: { type: Number, default: null },

  status: {
    type: String,
    enum: ["scheduled", "cancelled"],
    default: "scheduled",
  },
  cancel_reason: { type: String, default: null },
  cancelled_at: { type: Date, default: null },
  rescheduled_from: { type: Date, default: null },

  /**
   * Which reminders have gone out, so the job is idempotent across restarts
   * and overlapping ticks (`["24h", "15m"]`).
   */
  reminders_sent: { type: [String], default: [] },
});

sessionSchema.plugin(serializePlugin);
sessionSchema.index({ scheduled_at: -1 });
sessionSchema.index({ course_id: 1, scheduled_at: -1 });

export const Session =
  mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
