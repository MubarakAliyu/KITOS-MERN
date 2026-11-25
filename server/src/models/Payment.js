import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * One payment attempt (PRD §8.2, §11.1, FR16).
 *
 * Money is stored as integer kobo and serialised to naira for the frontend
 * (ADR-002). Nothing in this file holds a float.
 *
 * `tx_ref` is unique, and that index is what makes confirmation
 * idempotent: verify and the webhook both arrive for the same reference, in
 * either order and sometimes at once, and both must end with one paid payment
 * and one activated enrolment (AC3.3).
 *
 * The field was `paystack_ref` until ADR-036 moved the platform to
 * Flutterwave. `tx_ref` is both Flutterwave's own name for it and a name no
 * future provider change has to touch.
 */
const paymentSchema = new mongoose.Schema({
  /** Our own reference, `KIT-<ulid>`, sent to the gateway as its `tx_ref`. */
  tx_ref: { type: String, required: true },

  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  course_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },

  /**
   * Snapshotted names, as the receipt shows them.
   *
   * A receipt is a record of a transaction as it stood. Renaming a course or
   * a child afterwards must not rewrite a receipt a family already holds —
   * the same reasoning as the certificate (ADR-027).
   */
  parent_name: { type: String, default: "" },
  student_name: { type: String, default: "" },
  student_admission_no: { type: String, default: null },
  course_title: { type: String, default: "" },

  amount_kobo: { type: Number, required: true, min: 0 },

  type: {
    type: String,
    enum: ["subscription", "one_time"],
    default: "one_time",
  },

  /**
   * `paid` rather than `success`, because that is the word the retained
   * payment screens filter and badge on (ADR-021: the frontend contract
   * wins where it differs from the PRD's wording).
   */
  status: {
    type: String,
    enum: ["pending", "paid", "failed"],
    default: "pending",
  },

  receipt_no: { type: String, default: null },
  paid_at: { type: Date, default: null },

  /** Where the confirmation came from, which matters when reconciling. */
  confirmed_via: {
    type: String,
    enum: ["verify", "webhook", "simulated", null],
    default: null,
  },

  /** What the gateway said, kept for reconciliation. Never trusted for amounts. */
  gateway_response: { type: String, default: null },
  channel: { type: String, default: null },
});

paymentSchema.plugin(serializePlugin);

paymentSchema.index({ tx_ref: 1 }, { unique: true });
paymentSchema.index({ parent_id: 1, created_at: -1 });
paymentSchema.index({ student_id: 1, created_at: -1 });
paymentSchema.index({ status: 1, created_at: -1 });
paymentSchema.index({ receipt_no: 1 }, { sparse: true });

export const Payment =
  mongoose.models.Payment ?? mongoose.model("Payment", paymentSchema);
