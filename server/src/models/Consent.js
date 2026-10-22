import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";
import { CONSENT_SCOPES } from "../config/constants.js";

/**
 * A parent's recorded consent for a child's account (PRD §8.2).
 *
 * The Nigeria Data Protection Act 2023 requires demonstrable parental consent
 * before processing a child's data, so this is kept as evidence, not as a
 * boolean on the student: who consented, to what version of the notice, when,
 * and from which device. Rows are never updated — withdrawing consent means
 * deactivating the account, and a new consent is a new row.
 */
const consentSchema = new mongoose.Schema({
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true,
  },
  version: { type: String, required: true },
  scopes: {
    type: [{ type: String, enum: CONSENT_SCOPES }],
    default: () => [...CONSENT_SCOPES],
  },
  accepted_at: { type: Date, required: true, default: () => new Date() },
  ip: { type: String, default: null },
  user_agent: { type: String, default: null },
});

consentSchema.plugin(serializePlugin);

consentSchema.index({ student_id: 1, accepted_at: -1 });
consentSchema.index({ parent_id: 1 });

export const Consent =
  mongoose.models.Consent ?? mongoose.model("Consent", consentSchema);
