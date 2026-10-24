import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/** A module within a course (PRD §8.2). Ordered by `order_index`. */
const moduleSchema = new mongoose.Schema({
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  title: { type: String, required: true, trim: true },
  order_index: { type: Number, default: 1 },
});

moduleSchema.plugin(serializePlugin);
moduleSchema.index({ course_id: 1, order_index: 1 });

export const Module =
  mongoose.models.Module ?? mongoose.model("Module", moduleSchema);
