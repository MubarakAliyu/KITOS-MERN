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
  /**
   * A line or two saying what the module covers, shown under its title in
   * the editor. Modules could not be edited at all until now, so there was
   * never anywhere to type one.
   */
  description: { type: String, default: "" },
  order_index: { type: Number, default: 1 },
});

moduleSchema.plugin(serializePlugin);
moduleSchema.index({ course_id: 1, order_index: 1 });

export const Module =
  mongoose.models.Module ?? mongoose.model("Module", moduleSchema);
