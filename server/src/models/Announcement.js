import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * An administrator's announcement, kept as the record of what was sent
 * (PRD §9.5, FR17).
 *
 * The notifications it fans out to are separate documents, one per recipient,
 * because each is read and dismissed individually. This row is the sent item:
 * who sent it, to which audience, and how many people it reached — which is
 * what an administrator asks afterwards, and what the fan-out count would
 * otherwise be impossible to recover.
 */
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, default: "" },

  /** `all`, a single role, or everyone enrolled on one course. */
  audience: {
    type: String,
    enum: ["all", "role", "course"],
    default: "all",
  },
  audience_role: {
    type: String,
    enum: ["admin", "instructor", "parent", "student", null],
    default: null,
  },
  audience_course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    default: null,
  },

  sent_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  /** How many notifications the fan-out actually created. */
  recipient_count: { type: Number, default: 0 },

  link: { type: String, default: null },
});

announcementSchema.plugin(serializePlugin);

announcementSchema.index({ created_at: -1 });
announcementSchema.index({ sent_by: 1, created_at: -1 });

export const Announcement =
  mongoose.models.Announcement ??
  mongoose.model("Announcement", announcementSchema);
