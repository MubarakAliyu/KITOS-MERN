import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/** An assignment set on a module (PRD §8.2, FR9). */
const assignmentSchema = new mongoose.Schema({
  module_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Module",
    required: true,
    index: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true },
  instructions: { type: String, default: "" },
  deadline: { type: Date, default: null },

  /**
   * How the work is handed in and marked (Add Assignment modal).
   *
   * The modal has always collected these five and the API has always
   * discarded them — the schema did not name them, so `.strict()` refused
   * the whole request and no assignment could be created at all. Stored
   * rather than ignored: an instructor who sets a 50-point assignment with a
   * 10% late penalty has said something about how the work is marked.
   */
  submission_types: {
    type: [{ type: String, enum: ["text", "link", "file"] }],
    default: () => ["file"],
  },
  max_score: { type: Number, default: 100, min: 1, max: 1000 },
  grade_type: {
    type: String,
    enum: ["letter", "percentage", "pass_fail"],
    default: "percentage",
  },
  allow_late: { type: Boolean, default: false },
  /** Percentage deducted from a late submission. Null when none applies. */
  late_penalty: { type: Number, default: null, min: 0, max: 100 },
});

assignmentSchema.plugin(serializePlugin);

export const Assignment =
  mongoose.models.Assignment ??
  mongoose.model("Assignment", assignmentSchema);
