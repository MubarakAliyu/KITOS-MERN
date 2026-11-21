import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A certificate issued on course completion (PRD §8.2, FR11).
 *
 * `serial` and `verification_code` are both uniquely indexed. The serial is
 * the human-readable reference; the verification code is what a stranger
 * types at /verify/<code>, so it is random rather than sequential — a
 * guessable code would let anyone enumerate the school's pupils.
 *
 * One certificate per student per course: the unique index is what makes
 * issuing idempotent under a retry.
 */
const certificateSchema = new mongoose.Schema({
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
  serial: { type: String, required: true },
  verification_code: { type: String, required: true, uppercase: true },
  issued_at: { type: Date, default: () => new Date() },
  pdf_url: { type: String, default: null },
  /** Snapshot: a certificate must not change if a course is later renamed. */
  student_name: { type: String, required: true },
  course_title: { type: String, required: true },
  instructor_name: { type: String, default: null },
  score_average: { type: Number, default: null },
});

certificateSchema.plugin(serializePlugin);
certificateSchema.index({ serial: 1 }, { unique: true });
certificateSchema.index({ verification_code: 1 }, { unique: true });
certificateSchema.index({ student_id: 1, course_id: 1 }, { unique: true });

export const Certificate =
  mongoose.models.Certificate ??
  mongoose.model("Certificate", certificateSchema);
