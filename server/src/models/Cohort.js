import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";
import { PROGRAMME_TRACKS } from "../config/constants.js";

/**
 * A bootcamp intake (PRD §8.2) — the physical-world grouping KIT runs in
 * Birnin Kebbi and Sokoto. Sessions in Batch 2 schedule against a cohort.
 */
const cohortSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  programme_track: {
    type: String,
    enum: PROGRAMME_TRACKS,
    required: true,
    index: true,
  },
  start_date: { type: Date, default: null },
  end_date: { type: Date, default: null },
  venue: { type: String, default: null },
  mode: {
    type: String,
    enum: ["online", "physical", "hybrid"],
    default: "hybrid",
  },
  instructor_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

cohortSchema.plugin(serializePlugin);

cohortSchema.index({ programme_track: 1, start_date: -1 });

export const Cohort =
  mongoose.models.Cohort ?? mongoose.model("Cohort", cohortSchema);
