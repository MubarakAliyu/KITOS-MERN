import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A course (PRD §8.2, FR7).
 *
 * `price_kobo` is an integer, never a float (ADR-002): the serialiser hands
 * the frontend naira, but money is only ever stored and compared in kobo.
 */
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  thumbnail: { type: String, default: null },

  instructor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },

  /**
   * A track slug from the `tracks` collection.
   *
   * Not a Mongoose enum any more: tracks are rows a manager can add, and an
   * enum compiled from a constant would reject every one of them. The
   * service checks the slug against the collection before saving, which is
   * the check an enum was standing in for.
   */
  programme_track: { type: String, required: true },

  status: {
    type: String,
    enum: ["draft", "published"],
    default: "draft",
    index: true,
  },

  price_kobo: { type: Number, default: 0, min: 0 },
  payment_type: {
    type: String,
    enum: ["subscription", "one_time"],
    default: "one_time",
  },
});

courseSchema.plugin(serializePlugin);
courseSchema.index({ status: 1, programme_track: 1 });

export const Course =
  mongoose.models.Course ?? mongoose.model("Course", courseSchema);
