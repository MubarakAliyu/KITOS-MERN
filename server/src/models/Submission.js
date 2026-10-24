import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A student's submission for an assignment (PRD §8.2, FR9).
 *
 * One per student per assignment — resubmitting replaces the content rather
 * than piling up rows, which is what the instructor's review queue expects.
 */
const submissionSchema = new mongoose.Schema({
  assignment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    required: true,
  },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true,
  },
  submission_type: {
    type: String,
    enum: ["text", "link", "file"],
    default: "text",
  },
  content: { type: String, default: "" },
  file_url: { type: String, default: null },
  status: {
    type: String,
    enum: ["submitted", "reviewed"],
    default: "submitted",
  },
  grade: { type: String, default: null },
  feedback: { type: String, default: null },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reviewed_at: { type: Date, default: null },
});

submissionSchema.plugin(serializePlugin);
submissionSchema.index({ assignment_id: 1, student_id: 1 }, { unique: true });
submissionSchema.index({ student_id: 1, status: 1 });

export const Submission =
  mongoose.models.Submission ??
  mongoose.model("Submission", submissionSchema);
