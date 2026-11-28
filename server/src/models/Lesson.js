import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";
import { LESSON_CONTENT_TYPES } from "../config/constants.js";

/**
 * A lesson (PRD §8.2, FR7).
 *
 * `course_id` is denormalised alongside `module_id` because almost every read
 * is "all lessons on this course" — for progress, for the catalogue, for the
 * student's course page — and walking modules first would turn each of those
 * into two queries.
 *
 * `body_content` is sanitised HTML. It is sanitised on the way *in*, in the
 * service, so nothing unsafe is ever stored.
 */
const lessonSchema = new mongoose.Schema({
  module_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Module",
    required: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true },
  /**
   * The editor offers four kinds, so four are stored.
   *
   * It offered them before this field accepted them: "video" and "text"
   * were the whole enum, and picking File or Link in the lesson editor made
   * `PUT /lessons/:id` fail validation with a message about the request
   * body. The UI and the model now name the same set.
   */
  content_type: {
    type: String,
    enum: LESSON_CONTENT_TYPES,
    default: "text",
  },
  youtube_url: { type: String, default: null },
  body_content: { type: String, default: "" },
  resources: [
    {
      _id: false,
      title: { type: String, required: true },
      url: { type: String, required: true },
    },
  ],
  order_index: { type: Number, default: 1 },
  duration_minutes: { type: Number, default: null },
  /**
   * Whether students see this lesson. The editor has had a Published/Draft
   * switch all along; there was nowhere to put its value, so every save
   * carrying it was rejected whole.
   *
   * Defaults to true: lessons written before this field existed are already
   * visible, and a migration that hid them would lose content from courses
   * that are running.
   */
  is_published: { type: Boolean, default: true },
});

lessonSchema.plugin(serializePlugin);
lessonSchema.index({ module_id: 1, order_index: 1 });

export const Lesson =
  mongoose.models.Lesson ?? mongoose.model("Lesson", lessonSchema);
