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
});

assignmentSchema.plugin(serializePlugin);

export const Assignment =
  mongoose.models.Assignment ??
  mongoose.model("Assignment", assignmentSchema);
