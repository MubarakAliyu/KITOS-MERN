import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A student's enrolment on a course (PRD §8.2, FR10, ADR-006).
 *
 * The legacy schema inferred enrolment from a student's programme track and
 * their payments, which meant it could not answer "is this child enrolled?"
 * without reconstructing history. This states it.
 *
 * `progress` is a cached 0–100 recalculated by the progress service whenever
 * anything that feeds it changes — including when content is *added*, which
 * lowers everyone's percentage.
 */
const enrollmentSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "active", "completed", "cancelled"],
    default: "active",
    index: true,
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  source: {
    type: String,
    enum: ["admin", "payment", "seed"],
    default: "admin",
  },
  completed_at: { type: Date, default: null },
  last_activity_at: { type: Date, default: null },
});

enrollmentSchema.plugin(serializePlugin);
enrollmentSchema.index({ student_id: 1, course_id: 1 }, { unique: true });
enrollmentSchema.index({ course_id: 1, status: 1 });

export const Enrollment =
  mongoose.models.Enrollment ??
  mongoose.model("Enrollment", enrollmentSchema);
