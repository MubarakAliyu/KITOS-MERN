import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";
import { TRACK_STATUSES } from "../config/constants.js";

/**
 * A programme track: "Scratch Programming", "Web Development", and whatever
 * the centre opens next (PRD §8.2).
 *
 * This was a hard-coded array in `config/constants.js`, a Mongoose enum on
 * three models, and a copy of the same three strings in four React forms.
 * Adding a track therefore meant editing five files and deploying twice.
 *
 * `slug` is what every other collection stores, so it is immutable once
 * created: renaming a track changes `name` and leaves every course and
 * student pointing at the same row. Tracks are archived rather than deleted
 * while anything references them, so no record is left naming a track that
 * no longer exists.
 */
const trackSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  description: { type: String, default: "" },
  status: { type: String, enum: TRACK_STATUSES, default: "active", index: true },
  created_at: { type: Date, default: Date.now },
});

trackSchema.plugin(serializePlugin);

export const Track =
  mongoose.models.Track ?? mongoose.model("Track", trackSchema);
