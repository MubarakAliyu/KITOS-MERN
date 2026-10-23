import mongoose from "mongoose";

/**
 * Sequence counters (PRD §8.2). `_id` is the counter key —
 * `admission:26`, `receipt:202610`, `cert:2026` — and `seq` the last value
 * issued. Advanced only through `lib/numbering.js`, never written directly.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false, _id: false }
);

export const Counter =
  mongoose.models.Counter ?? mongoose.model("Counter", counterSchema);
