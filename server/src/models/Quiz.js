import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A quiz with its questions embedded (PRD §8.2, FR8).
 *
 * Embedded rather than a separate `questions` collection: questions are never
 * read or written apart from their quiz, there are a handful per quiz, and
 * keeping them together makes grading one document read. The legacy schema
 * had a `questions` table and stored `options` as a JSON string, which is the
 * worst of both.
 *
 * `correct_answer` must never reach a student — `toStudentJSON()` is the only
 * shape the student routes return.
 */
const questionSchema = new mongoose.Schema(
  {
    question_text: { type: String, required: true },
    question_type: {
      type: String,
      enum: ["mcq", "true_false"],
      default: "mcq",
    },
    options: [{ type: String }],
    correct_answer: { type: String, required: true },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema({
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
  lesson_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lesson",
    default: null,
  },
  title: { type: String, required: true, trim: true },
  order_index: { type: Number, default: 1 },
  questions: { type: [questionSchema], default: [] },
});

quizSchema.plugin(serializePlugin);

/**
 * The questions as a student may see them: no `correct_answer`.
 *
 * A method rather than a convention, so a route cannot forget — sending the
 * answers to the quiz player would make every quiz pointless.
 */
quizSchema.methods.toStudentJSON = function toStudentJSON() {
  return this.questions.map((question) => ({
    id: String(question._id),
    quiz_id: String(this._id),
    question_text: question.question_text,
    question_type: question.question_type,
    options: [...question.options],
  }));
};

export const Quiz = mongoose.models.Quiz ?? mongoose.model("Quiz", quizSchema);
