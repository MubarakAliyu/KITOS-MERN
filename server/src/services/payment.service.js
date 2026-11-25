import mongoose from "mongoose";
import { Payment } from "../models/Payment.js";
import { Subscription } from "../models/Subscription.js";
import { Student } from "../models/Student.js";
import { Course } from "../models/Course.js";
import { User } from "../models/User.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { koboToNaira, nairaToKobo } from "../lib/serialize.js";
import { nextReceiptNumber } from "../lib/numbering.js";
import { logger } from "../lib/logger.js";
import { supportsTransactions } from "../config/db.js";
import { env } from "../config/env.js";
import {
  initializeTransaction,
  isSimulated,
  newReference,
  verifyTransaction,
} from "../lib/paystack.js";
import { enrol } from "./enrollment.service.js";
import { notify } from "./notification.service.js";

/**
 * Payments, subscriptions and receipts (PRD §11.1, FR16).
 *
 * The one rule worth stating at the top: **the amount comes from the course,
 * never from the request**. The retained modal sends an `amount` because its
 * mock handlers did; it is accepted by the validator and ignored here. A
 * browser that could set the price would be the whole of the vulnerability.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function serializePayment(row) {
  return {
    id: String(row._id),
    parent_id: String(row.parent_id),
    student_id: String(row.student_id),
    course_id: String(row.course_id),
    parent_name: row.parent_name ?? "",
    student_name: row.student_name ?? "",
    student_admission_no: row.student_admission_no ?? null,
    course_title: row.course_title ?? "",
    // Naira for the screens, kobo for the books (ADR-002).
    amount: koboToNaira(row.amount_kobo),
    amount_kobo: row.amount_kobo,
    type: row.type,
    status: row.status,
    paystack_ref: row.paystack_ref,
    receipt_no: row.receipt_no ?? null,
    created_at: row.created_at?.toISOString() ?? null,
    paid_at: row.paid_at?.toISOString() ?? null,
    confirmed_via: row.confirmed_via ?? null,
  };
}

function serializeSubscription(row) {
  return {
    id: String(row._id),
    parent_id: String(row.parent_id),
    student_id: String(row.student_id),
    course_id: String(row.course_id),
    student_name: row.student_name ?? "",
    course_title: row.course_title ?? "",
    amount: koboToNaira(row.amount_kobo),
    amount_kobo: row.amount_kobo,
    interval: row.interval,
    status: row.status,
    start_date: row.start_date?.toISOString() ?? null,
    next_billing: row.next_billing?.toISOString() ?? null,
  };
}

/**
 * The parent who pays for a child, and the child's own details.
 *
 * A parent may only pay for their own child, which is checked here rather
 * than trusted from the `parent_id` the modal sends.
 */
async function resolveFamily({ user, studentId }) {
  if (!mongoose.isValidObjectId(studentId)) {
    throw badRequest("Validation failed", undefined, {
      student_id: "Must be a valid id",
    });
  }

  const student = await Student.findById(studentId);
  if (!student) throw notFound("Student not found");

  if (user.role === "parent" && String(student.parent_id) !== String(user._id)) {
    throw forbidden(
      "You can only pay for your own child",
      "That pupil belongs to another family"
    );
  }

  const parent =
    user.role === "parent" ? user : await User.findById(student.parent_id);
  if (!parent) throw notFound("That pupil has no parent account");

  const account = await User.findById(student.user_id).select("admission_no");

  return { student, parent, admissionNo: account?.admission_no ?? null };
}

/**
 * Opens a payment (PRD §11.1 step 1).
 *
 * Creates the pending row first and then asks Paystack to initialise, so a
 * transaction that is started but never completed is still visible to an
 * administrator as a pending payment rather than vanishing.
 */
export async function initiatePayment({ user, payload }) {
  const { student, parent, admissionNo } = await resolveFamily({
    user,
    studentId: payload.student_id,
  });

  const course = await Course.findById(payload.course_id);
  if (!course) throw notFound("Course not found");

  const amountKobo = course.price_kobo ?? 0;
  if (amountKobo <= 0) {
    throw badRequest(
      "That course has no fee set",
      "An administrator needs to set the course price first"
    );
  }

  const type = payload.type ?? course.payment_type ?? "one_time";
  const reference = newReference();

  const payment = await Payment.create({
    paystack_ref: reference,
    parent_id: parent._id,
    student_id: student._id,
    course_id: course._id,
    parent_name: parent.name,
    student_name: student.name,
    student_admission_no: admissionNo,
    course_title: course.title,
    amount_kobo: amountKobo,
    type,
    status: "pending",
  });

  try {
    const gateway = await initializeTransaction({
      reference,
      amountKobo,
      // Paystack requires an email; a child has none (FR16, PRD §10), so the
      // paying parent's address is the right one and the one a receipt
      // should reach anyway.
      email: parent.email,
      callbackUrl: `${env.CLIENT_ORIGIN}/parent/payments?ref=${reference}`,
      metadata: {
        student_id: String(student._id),
        course_id: String(course._id),
        type,
      },
    });

    return {
      reference,
      access_code: gateway.access_code,
      authorization_url: gateway.authorization_url,
      amount: koboToNaira(amountKobo),
      amount_kobo: amountKobo,
      simulated: Boolean(gateway.simulated),
      payment: serializePayment(payment),
    };
  } catch (err) {
    // Paystack refused to open it, so the row would stay pending for ever.
    payment.status = "failed";
    payment.gateway_response = err.message?.slice(0, 300) ?? "Initialise failed";
    await payment.save();
    throw badRequest(
      "We could not start that payment",
      "The payment provider did not accept the request. Please try again."
    );
  }
}

/**
 * Confirms a payment, exactly once (PRD §11.1 step 4, AC3.3).
 *
 * Verify and the webhook both arrive for the same reference — in either
 * order, sometimes within milliseconds of each other — and between them they
 * must produce one paid payment, one receipt number, one activated enrolment
 * and one notification.
 *
 * The gate is a single atomic update: whoever flips `pending` to `paid` wins
 * and does the side effects, and everyone else reads the finished row back.
 * A transaction alone would not be enough — two concurrent transactions can
 * both read `pending` and both proceed, and on a replica set one would then
 * fail on write conflict rather than being correctly idempotent.
 */
export async function confirmPayment({ reference, via, gatewayData = {} }) {
  const payment = await Payment.findOne({ paystack_ref: reference });
  if (!payment) throw notFound("That payment reference is not recognised");

  // Already done: hand back what exists. This is the idempotent path and it
  // is the common one, because the webhook almost always follows a verify.
  if (payment.status === "paid") {
    logger.debug({ reference, via }, "Payment already confirmed; ignoring");
    return { payment: serializePayment(payment), already_confirmed: true };
  }

  if (gatewayData.status && gatewayData.status !== "success") {
    payment.status = "failed";
    payment.gateway_response =
      gatewayData.gateway_response ?? `Paystack reported ${gatewayData.status}`;
    payment.confirmed_via = via;
    await payment.save();
    return { payment: serializePayment(payment), already_confirmed: false };
  }

  /**
   * What Paystack says was paid must match what we asked for.
   *
   * Without this an attacker could initialise a ₦25,000 enrolment, pay ₦100
   * on their own Paystack account, and present that reference. The amount is
   * only compared when the gateway reported one.
   */
  if (
    typeof gatewayData.amount === "number" &&
    gatewayData.amount !== payment.amount_kobo
  ) {
    payment.status = "failed";
    payment.gateway_response = `Amount mismatch: expected ${payment.amount_kobo}, got ${gatewayData.amount}`;
    payment.confirmed_via = via;
    await payment.save();
    logger.error(
      { reference, expected: payment.amount_kobo, got: gatewayData.amount },
      "Refusing a payment whose amount does not match the course fee"
    );
    throw badRequest(
      "That payment does not match the course fee",
      "Nothing has been charged to your enrolment. Please contact Kids In Tech."
    );
  }

  // The gate. `status: "pending"` in the filter is what makes it a claim.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    { $set: { status: "paid", paid_at: new Date(), confirmed_via: via } },
    { new: true }
  );

  if (!claimed) {
    // Someone else won the race between our read and our update.
    const settled = await Payment.findById(payment._id);
    return { payment: serializePayment(settled), already_confirmed: true };
  }

  try {
    await applyConfirmation({ payment: claimed, gatewayData });
  } catch (err) {
    // The money is taken and the payment is marked paid; the enrolment is
    // what failed. Rolling the payment back would be worse — it would invite
    // a second charge. So this is logged loudly for an administrator to
    // finish by hand, and the caller still sees a paid payment.
    logger.error(
      { err, reference, payment_id: String(claimed._id) },
      "Payment confirmed but activation failed — needs manual completion"
    );
    await ActivityLog.create({
      actor_role: "system",
      actor_name: "Payment confirmation",
      action: "payment_activation_failed",
      description: `Payment ${claimed.receipt_no ?? reference} is paid but its enrolment did not activate: ${err.message}`,
      target_type: "payment",
      target_id: String(claimed._id),
    });
  }

  const finished = await Payment.findById(claimed._id);
  return { payment: serializePayment(finished), already_confirmed: false };
}

/**
 * Everything that follows a successful payment: receipt number, enrolment,
 * subscription, notifications and the audit row.
 *
 * In one transaction where the deployment supports one, so a half-applied
 * confirmation cannot leave a paid payment with no enrolment. The in-memory
 * replica set and Atlas both support transactions; a single standalone mongod
 * does not, and there it runs the same steps sequentially.
 */
async function applyConfirmation({ payment, gatewayData }) {
  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;

  const work = async () => {
    const opts = session ? { session } : {};

    // Receipt numbers come from the atomic counter, so two confirmations in
    // the same month cannot be handed the same one.
    if (!payment.receipt_no) {
      payment.receipt_no = await nextReceiptNumber(
        session ? { session } : {}
      );
    }
    payment.gateway_response =
      gatewayData.gateway_response ?? payment.gateway_response ?? null;
    payment.channel = gatewayData.channel ?? payment.channel ?? null;
    await payment.save(opts);

    // The Batch 2 hook: idempotent, and it revives a cancelled enrolment.
    await enrol({
      studentId: payment.student_id,
      courseId: payment.course_id,
      source: "payment",
      session,
    });

    if (payment.type === "subscription") {
      await Subscription.findOneAndUpdate(
        { student_id: payment.student_id, course_id: payment.course_id },
        {
          $set: {
            parent_id: payment.parent_id,
            student_name: payment.student_name,
            course_title: payment.course_title,
            amount_kobo: payment.amount_kobo,
            interval: "monthly",
            status: "active",
            next_billing: new Date(Date.now() + MONTH_MS),
          },
          $setOnInsert: { start_date: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }
      );
    }
  };

  try {
    if (session) await session.withTransaction(work);
    else await work();
  } finally {
    await session?.endSession();
  }

  // Outside the transaction: a notification that fails must not undo a
  // payment, and a push to a socket cannot be rolled back anyway.
  await notifyConfirmation(payment);
}

async function notifyConfirmation(payment) {
  const naira = koboToNaira(payment.amount_kobo).toLocaleString("en-NG");

  await notify({
    userId: payment.parent_id,
    type: "payment_success",
    title: "Payment confirmed",
    message: `₦${naira} for ${payment.course_title} was successful. Receipt ${payment.receipt_no}.`,
    link: "/parent/payments",
  });

  const admins = await User.find({ role: "admin", is_active: true }).select("_id");
  for (const admin of admins) {
    await notify({
      userId: admin._id,
      type: "payment_success",
      title: "Payment received",
      message: `${payment.parent_name} paid ₦${naira} for ${payment.course_title} (${payment.student_name}).`,
      link: "/admin/payments",
    });
  }

  await ActivityLog.create({
    actor_role: "system",
    actor_name: payment.parent_name || "Parent",
    action: "payment_confirmed",
    description: `Payment ${payment.receipt_no} confirmed for ${payment.course_title} (${payment.student_name})`,
    target_type: "payment",
    target_id: String(payment._id),
    meta: {
      amount_kobo: payment.amount_kobo,
      type: payment.type,
      confirmed_via: payment.confirmed_via,
    },
  });
}

/**
 * `POST /paystack/verify` (PRD §11.1 steps 2 and 4).
 *
 * The caller supplies a reference and nothing else that matters: the amount,
 * course and child all come from the payment row we created at initiate.
 */
export async function verifyPayment({ user, payload }) {
  const payment = await Payment.findOne({ paystack_ref: payload.reference });
  if (!payment) throw notFound("That payment reference is not recognised");

  if (
    user.role === "parent" &&
    String(payment.parent_id) !== String(user._id)
  ) {
    throw forbidden("That payment belongs to another family");
  }

  const gatewayData = await verifyTransaction({
    reference: payload.reference,
    expectedAmountKobo: payment.amount_kobo,
  });

  const result = await confirmPayment({
    reference: payload.reference,
    via: isSimulated() ? "simulated" : "verify",
    gatewayData,
  });

  // The retained modal reads `.reference` and `.payment` off this response.
  return {
    status: result.payment.status === "paid" ? "success" : result.payment.status,
    reference: payload.reference,
    payment: result.payment,
    already_confirmed: result.already_confirmed,
  };
}

/**
 * `POST /paystack/webhook` (PRD §11.1 step 3).
 *
 * The signature is checked in the route, on the raw body, before this runs.
 * Paystack retries a webhook it does not get a 200 for, so anything that is
 * not actionable still answers 200 — a 500 would earn an endless retry for an
 * event we were never going to act on.
 */
export async function handleWebhook({ event }) {
  const type = event?.event;
  const reference = event?.data?.reference;

  if (!reference) {
    logger.warn({ type }, "Paystack webhook with no reference; ignoring");
    return { received: true, handled: false };
  }

  if (type !== "charge.success" && type !== "subscription.create") {
    logger.debug({ type, reference }, "Paystack webhook we do not act on");
    return { received: true, handled: false };
  }

  const exists = await Payment.exists({ paystack_ref: reference });
  if (!exists) {
    // A reference we never issued: either another integration on the same
    // Paystack account, or someone probing the endpoint.
    logger.warn({ type, reference }, "Paystack webhook for an unknown reference");
    return { received: true, handled: false };
  }

  const result = await confirmPayment({
    reference,
    via: "webhook",
    gatewayData: {
      status: event.data?.status,
      amount: event.data?.amount,
      gateway_response: event.data?.gateway_response,
      channel: event.data?.channel,
    },
  });

  return {
    received: true,
    handled: true,
    already_confirmed: result.already_confirmed,
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * `GET /payments`.
 *
 * A parent sees their own, an admin sees all. The `parent_id` and
 * `student_id` filters the UI sends are honoured only where they do not widen
 * what the caller may see.
 */
export async function listPayments({ user, query = {} }) {
  const filter = {};

  if (user.role === "parent") {
    filter.parent_id = user._id;
  } else if (query.parent_id && mongoose.isValidObjectId(query.parent_id)) {
    filter.parent_id = query.parent_id;
  }

  if (query.student_id && mongoose.isValidObjectId(query.student_id)) {
    filter.student_id = query.student_id;
  }
  if (query.status && query.status !== "all") filter.status = query.status;
  if (query.type && query.type !== "all") filter.type = query.type;

  if (query.from || query.to) {
    filter.created_at = {};
    if (query.from) filter.created_at.$gte = new Date(query.from);
    if (query.to) filter.created_at.$lte = new Date(query.to);
  }

  let rows = await Payment.find(filter).sort({ created_at: -1 }).limit(500);

  // The admin table's search box covers names, course and reference.
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((row) =>
      [
        row.parent_name,
        row.student_name,
        row.course_title,
        row.paystack_ref,
        row.receipt_no,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }

  return rows.map(serializePayment);
}

/**
 * `GET /payments/stats` — the cards and the stacked bar chart.
 *
 * Six months of history, which is what the chart draws, and always six
 * buckets: a month with no revenue is a gap in the bars, not a missing
 * category the chart would silently drop.
 */
export async function paymentStats({ user }) {
  const scope = user.role === "parent" ? { parent_id: user._id } : {};

  const paid = await Payment.find({ ...scope, status: "paid" }).select(
    "amount_kobo type created_at"
  );

  const subscriptionKobo = paid
    .filter((p) => p.type === "subscription")
    .reduce((sum, p) => sum + p.amount_kobo, 0);
  const oneTimeKobo = paid
    .filter((p) => p.type === "one_time")
    .reduce((sum, p) => sum + p.amount_kobo, 0);

  const [pendingCount, failedCount] = await Promise.all([
    Payment.countDocuments({ ...scope, status: "pending" }),
    Payment.countDocuments({ ...scope, status: "failed" }),
  ]);

  const months = lastMonths(6);
  const buckets = new Map(
    months.map((m) => [m.key, { month: m.label, subscription: 0, one_time: 0 }])
  );

  for (const payment of paid) {
    const key = monthKey(payment.created_at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket[payment.type] += koboToNaira(payment.amount_kobo);
  }

  const monthly = months.map((m) => buckets.get(m.key));
  const thisMonth = monthly.at(-1);
  const lastMonth = monthly.at(-2);

  return {
    total_revenue: koboToNaira(subscriptionKobo + oneTimeKobo),
    subscription_revenue: koboToNaira(subscriptionKobo),
    one_time_revenue: koboToNaira(oneTimeKobo),
    pending_count: pendingCount,
    failed_count: failedCount,
    this_month: (thisMonth?.subscription ?? 0) + (thisMonth?.one_time ?? 0),
    last_month: (lastMonth?.subscription ?? 0) + (lastMonth?.one_time ?? 0),
    monthly_data: monthly,
  };
}

/** `YYYY-MM` in Lagos, so a payment at 00:30 lands in the right month. */
function monthKey(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date ?? new Date());
  return `${parts.find((p) => p.type === "year").value}-${
    parts.find((p) => p.type === "month").value
  }`;
}

/** The last `count` months, oldest first, with short labels for the charts. */
export function lastMonths(count, now = new Date()) {
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-US", { month: "short" }),
    });
  }
  return months;
}

/** `GET /payments/:id/receipt`. The owner, or an admin. */
export async function getReceipt({ user, paymentId }) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw notFound("Payment not found");

  if (
    user.role === "parent" &&
    String(payment.parent_id) !== String(user._id)
  ) {
    throw forbidden("That receipt belongs to another family");
  }
  if (!["parent", "admin"].includes(user.role)) {
    throw forbidden("You do not have permission to view that receipt");
  }

  if (payment.status !== "paid") {
    throw badRequest(
      "That payment has no receipt yet",
      `It is ${payment.status}`
    );
  }

  return {
    ...serializePayment(payment),
    // The retained ReceiptModal reads `receipt_number`.
    receipt_number: payment.receipt_no,
  };
}

/** `GET /subscriptions`. A parent's own plans; an admin sees all. */
export async function listSubscriptions({ user }) {
  const filter = user.role === "parent" ? { parent_id: user._id } : {};
  const rows = await Subscription.find(filter).sort({ created_at: -1 });
  return rows.map(serializeSubscription);
}

/**
 * `POST /subscriptions/cancel`.
 *
 * Marks the plan cancelled here. It does **not** cancel anything at Paystack,
 * because KITOS never created a Paystack subscription object — each month is
 * charged as its own transaction — so there is nothing there to cancel. The
 * effect is that no further month is expected, and the next charge simply
 * never arrives. Said plainly rather than implied, because "cancelled" could
 * otherwise be read as a promise about someone's card.
 */
export async function cancelSubscription({ user, planId }) {
  const plan = await Subscription.findById(planId);
  if (!plan) throw notFound("Subscription not found");

  if (user.role === "parent" && String(plan.parent_id) !== String(user._id)) {
    throw forbidden("That subscription belongs to another family");
  }

  if (plan.status === "cancelled") {
    throw conflict("That subscription is already cancelled");
  }

  plan.status = "cancelled";
  plan.cancelled_at = new Date();
  plan.next_billing = null;
  await plan.save();

  await notify({
    userId: plan.parent_id,
    type: "subscription_cancelled",
    title: "Subscription cancelled",
    message: `${plan.course_title} for ${plan.student_name} will not renew.`,
    link: "/parent/payments",
  });

  return { success: true, plan: serializeSubscription(plan) };
}

/** `GET /admin/payments` — the same envelope the admin courses screen uses. */
export async function adminPayments({ user, query = {} }) {
  const payments = await listPayments({ user, query });
  const totalKobo = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount_kobo, 0);

  return { payments, total_revenue: koboToNaira(totalKobo) };
}

export { serializePayment, serializeSubscription, nairaToKobo };
