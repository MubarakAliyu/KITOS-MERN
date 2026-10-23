import mongoose from "mongoose";
import { serializePlugin, avatarInitial } from "../lib/serialize.js";
import {
  PROGRAMME_TRACKS,
  STUDENT_STATUSES,
  toTrackLabel,
} from "../config/constants.js";

/**
 * A child's learning profile (PRD §8.2).
 *
 * Separate from `User` because the two have different lifetimes: a parent adds
 * a child and the profile exists immediately, while the sign-in identity is
 * what consent gates. `parent_id` points at the parent's **User**, as
 * `_types/schema.js` documents ("References User.id where role === 'parent'").
 *
 * `status` is `pending` until a Consent row exists; pending students cannot
 * sign in (PRD §10, "Consent").
 */
const studentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  name: { type: String, required: true, trim: true },

  // 8–18 is the programme's age range (PRD §3.1).
  age: { type: Number, required: true, min: 8, max: 18 },

  programme_track: {
    type: String,
    enum: PROGRAMME_TRACKS,
    required: true,
  },

  cohort_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cohort" }],

  consent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Consent",
    default: null,
  },

  status: {
    type: String,
    enum: STUDENT_STATUSES,
    default: "pending",
  },
});

studentSchema.plugin(serializePlugin);

studentSchema.index({ user_id: 1 }, { unique: true });
studentSchema.index({ parent_id: 1, created_at: 1 });

/**
 * The child shape the parent dashboard reads (handlers.js `PARENT_CHILDREN`).
 *
 * `programme_track` goes out as the display label the retained UI renders, and
 * the progress counters are passed in by the service — they come from the
 * enrollments collection, which arrives in Batch 2, so they are 0 until then.
 */
studentSchema.methods.toParentJSON = function toParentJSON(extra = {}) {
  return {
    id: String(this._id),
    parent_id: String(this.parent_id),
    name: this.name,
    age: this.age,
    programme_track: toTrackLabel(this.programme_track),
    avatar_initial: avatarInitial(this.name),
    enrolled_courses: 0,
    completed_courses: 0,
    status: this.status,
    ...extra,
  };
};

export const Student =
  mongoose.models.Student ?? mongoose.model("Student", studentSchema);
