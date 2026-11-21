import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * One student's attendance at one session (PRD §8.2, FR13).
 *
 * `method` records *how* it was captured — a roster mark by the instructor, a
 * QR scan by the student, or an automatic mark when they joined an online
 * session. The admin report distinguishes them, and a disputed mark is much
 * easier to settle when you know which it was.
 */
const attendanceSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true,
  },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "excused"],
    required: true,
  },
  method: {
    type: String,
    enum: ["roster", "qr", "auto"],
    default: "roster",
  },
  marked_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  marked_at: { type: Date, default: () => new Date() },
});

attendanceSchema.plugin(serializePlugin);
attendanceSchema.index({ session_id: 1, student_id: 1 }, { unique: true });
attendanceSchema.index({ student_id: 1 });

export const Attendance =
  mongoose.models.Attendance ??
  mongoose.model("Attendance", attendanceSchema);
