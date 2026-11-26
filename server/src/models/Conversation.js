import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A two-party conversation (PRD §8.2, §10).
 *
 * Exactly two participants, never a group: every allowed pair in PRD §10 is a
 * pair, and a group thread would make "may these two talk?" unanswerable.
 * `participant_ids` is sorted on save so the same two people always produce
 * the same key and the unique index can stop a duplicate thread.
 *
 * `observer_ids` carries the parents of a student in the thread. An observer
 * may read it and may not post — the child-safety rule is that a parent can
 * see their child's conversations, not that they can speak inside them
 * pretending to be the child.
 */
const conversationSchema = new mongoose.Schema({
  participant_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],

  /**
   * The two participants as one sorted, joined string.
   *
   * A unique index on `participant_ids` would not mean what it looks like:
   * on an array field the index is multikey, and uniqueness then applies to
   * each *element* across the whole collection — so the first conversation a
   * person joined would be their only one, for ever. The pair needs a scalar
   * to be unique on, and this is it. Derived on save, never set by a caller.
   */
  pair_key: { type: String, required: true },

  /** Parents of a student participant: read-only members of the thread. */
  observer_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: [],
    },
  ],

  /**
   * Denormalised for the conversation list, which the UI renders without
   * fetching messages. Written in the same service call as the message.
   */
  last_message: { type: String, default: "" },
  last_message_at: { type: Date, default: null },
  last_sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  /** Unread counts per participant, keyed by user id as a string. */
  unread: {
    type: Map,
    of: Number,
    default: () => new Map(),
  },

  /**
   * Set when anyone reports the thread. An admin is notified; nothing is
   * deleted, because the evidence is the point.
   */
  reported: { type: Boolean, default: false },
  reported_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reported_at: { type: Date, default: null },
  reported_reason: { type: String, default: null },
});

conversationSchema.plugin(serializePlugin);

/**
 * One thread per pair. Sorting the ids first is what makes the key mean
 * "these two people" rather than "these two in this order".
 */
conversationSchema.pre("validate", function derivePairKey(next) {
  if (this.isModified("participant_ids") || !this.pair_key) {
    const sorted = [...this.participant_ids].map(String).sort();
    this.participant_ids = sorted.map((id) => new mongoose.Types.ObjectId(id));
    this.pair_key = sorted.join(":");
  }
  next();
});

conversationSchema.index({ pair_key: 1 }, { unique: true });
conversationSchema.index({ participant_ids: 1 });
conversationSchema.index({ observer_ids: 1 });
conversationSchema.index({ last_message_at: -1 });
conversationSchema.index({ reported: 1, reported_at: -1 });

export const Conversation =
  mongoose.models.Conversation ??
  mongoose.model("Conversation", conversationSchema);
