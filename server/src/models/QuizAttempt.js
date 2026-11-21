import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * One student's record for one quiz (PRD §8.2, FR8).
 *
 * One row per student per quiz, not one per attempt: the PRD says retakes
 * update the best score, so `attempts` counts them and `score` holds the best
 * result. The unique index is what guarantees that.
 */
const quizAttemptSchema = new mongoose.Schema({
  quiz_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
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
  /** The best-scoring submission's answers, kept for review. */
  answers: [
    {
      _id: false,
      question_id: { type: String, required: true },
      answer: { type: String, default: "" },
      correct: { type: Boolean, default: false },
    },
  ],
  score: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  attempts: { type: Number, default: 1 },
});

quizAttemptSchema.plugin(serializePlugin);
quizAttemptSchema.index({ quiz_id: 1, student_id: 1 }, { unique: true });
quizAttemptSchema.index({ student_id: 1, course_id: 1 });

export const QuizAttempt =
  mongoose.models.QuizAttempt ??
  mongoose.model("QuizAttempt", quizAttemptSchema);
