import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * One message in a conversation (PRD §8.2).
 *
 * `receiver_id` is denormalised from the conversation: the retained UI reads
 * it on every message, and keeping it here means rendering a thread needs no
 * second lookup.
 *
 * Nothing is ever deleted. A reported message has to still be there for an
 * administrator to read, and in a service used by children the audit trail
 * matters more than tidiness.
 */
const messageSchema = new mongoose.Schema({
  conversation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  message: { type: String, default: "" },
  file_url: { type: String, default: null },
  file_type: { type: String, default: null },

  read: { type: Boolean, default: false },
  read_at: { type: Date, default: null },

  reported: { type: Boolean, default: false },
});

messageSchema.plugin(serializePlugin);

messageSchema.index({ conversation_id: 1, created_at: 1 });
messageSchema.index({ conversation_id: 1, read: 1 });
messageSchema.index({ sender_id: 1, created_at: -1 });

export const Message =
  mongoose.models.Message ?? mongoose.model("Message", messageSchema);
