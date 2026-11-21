import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/** A recording attached to a session (PRD §8.2, FR14). */
const recordingSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true,
    index: true,
  },
  title: { type: String, default: "" },
  url: { type: String, required: true },
  source: {
    type: String,
    enum: ["youtube", "drive", "other"],
    default: "youtube",
  },
  added_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

recordingSchema.plugin(serializePlugin);

export const Recording =
  mongoose.models.Recording ??
  mongoose.model("Recording", recordingSchema);
