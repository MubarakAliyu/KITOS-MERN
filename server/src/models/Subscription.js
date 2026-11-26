import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * A recurring plan for one child on one course (PRD §8.2, FR16).
 *
 * KITOS does not charge the card itself — Flutterwave does, and a successful
 * subscription payment arrives as a webhook. So this document records what
 * the family signed up to and when the next charge is due; it is not a
 * billing engine, and nothing here moves money.
 *
 * One plan per child per course, which the unique index enforces: paying a
 * second month must update the existing plan rather than open a second one
 * the family would then have to cancel twice.
 */
const subscriptionSchema = new mongoose.Schema({
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

  student_name: { type: String, default: "" },
  course_title: { type: String, default: "" },

  amount_kobo: { type: Number, required: true, min: 0 },
  interval: {
    type: String,
    enum: ["monthly", "termly", "yearly"],
    default: "monthly",
  },

  status: {
    type: String,
    enum: ["active", "cancelled"],
    default: "active",
  },

  start_date: { type: Date, default: () => new Date() },
  next_billing: { type: Date, default: null },
  cancelled_at: { type: Date, default: null },
});

subscriptionSchema.plugin(serializePlugin);

subscriptionSchema.index(
  { student_id: 1, course_id: 1 },
  { unique: true }
);
subscriptionSchema.index({ parent_id: 1, status: 1 });

export const Subscription =
  mongoose.models.Subscription ??
  mongoose.model("Subscription", subscriptionSchema);
