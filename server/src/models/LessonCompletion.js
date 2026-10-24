import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A lesson a student has finished (PRD §8.2, FR10).
 *
 * The unique index makes `POST /lessons/:id/complete` naturally idempotent:
 * clicking twice cannot inflate progress.
 */
const lessonCompletionSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  lesson_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lesson",
    required: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true,
  },
  completed_at: { type: Date, default: () => new Date() },
});

lessonCompletionSchema.plugin(serializePlugin);
lessonCompletionSchema.index(
  { student_id: 1, lesson_id: 1 },
  { unique: true }
);
lessonCompletionSchema.index({ student_id: 1, course_id: 1 });

export const LessonCompletion =
  mongoose.models.LessonCompletion ??
  mongoose.model("LessonCompletion", lessonCompletionSchema);
