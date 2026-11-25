import * as paymentService from "../services/payment.service.js";
import { verifyWebhookSignature, isSimulated } from "../lib/paystack.js";
import { renderReceiptPdf } from "../lib/receiptPdf.js";
import { logger } from "../lib/logger.js";
import { clientIp, logActivity } from "../lib/audit.js";

/**
 * Batch 3 controllers: payments, receipts and subscriptions.
 */

const handle = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const actorOf = (req) =>
  req.user
    ? { id: String(req.user._id), role: req.user.role, name: req.user.name }
    : null;

export const postInitiatePayment = handle(async (req, res) => {
  const result = await paymentService.initiatePayment({
    user: req.user,
    payload: req.body,
  });
  res.status(201).json(result);
});

export const postVerifyPayment = handle(async (req, res) => {
  const result = await paymentService.verifyPayment({
    user: req.user,
    payload: req.body,
  });

  // Audited once, not on every idempotent repeat.
  if (!result.already_confirmed && result.status === "success") {
    await logActivity({
      actor: actorOf(req),
      action: "payment_verified",
      description: `Verified payment ${result.payment.receipt_no} for ${result.payment.course_title}`,
      target_type: "payment",
      target_id: result.payment.id,
      ip: clientIp(req),
    });
  }

  res.status(200).json(result);
});

/**
 * `POST /paystack/webhook` — public, authenticated by signature.
 *
 * `req.body` is a Buffer here: the route mounts a raw body parser, because
 * the HMAC is over the exact bytes Paystack sent. Re-serialising parsed JSON
 * changes key order and whitespace, and the signature would never match.
 *
 * Paystack retries anything that is not a 2xx, so every outcome that is not
 * worth retrying answers 200 — including a signature we reject, which will
 * never become valid however many times it is sent.
 */
export const postPaystackWebhook = handle(async (req, res) => {
  const signature = req.get("x-paystack-signature");
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  if (isSimulated()) {
    // No secret key means no way to verify a signature, so the endpoint
    // cannot be trusted and must not act. Saying so plainly beats appearing
    // to work in an environment where it provably cannot.
    logger.warn("Paystack webhook received while in simulated mode; ignoring");
    return res.status(200).json({
      received: true,
      handled: false,
      reason: "Simulated mode: no secret key to verify a signature with",
    });
  }

  if (!verifyWebhookSignature({ rawBody, signature })) {
    logger.warn(
      { ip: clientIp(req), has_signature: Boolean(signature) },
      "Paystack webhook signature rejected"
    );
    // 200, deliberately: a forged signature is not a transient failure, and
    // a 4xx would have Paystack retry it for hours. Nothing is acted on.
    return res.status(200).json({ received: true, handled: false });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.warn("Paystack webhook body was not JSON");
    return res.status(200).json({ received: true, handled: false });
  }

  const result = await paymentService.handleWebhook({ event });
  res.status(200).json(result);
});

export const getPayments = handle(async (req, res) => {
  res.status(200).json(
    await paymentService.listPayments({ user: req.user, query: req.query })
  );
});

export const getPaymentStats = handle(async (req, res) => {
  res.status(200).json(await paymentService.paymentStats({ user: req.user }));
});

/**
 * `GET /payments/:id/receipt`, as JSON or as a PDF.
 *
 * The modal reads the JSON; `?format=pdf` is what the download button needs,
 * and carries the same marks as the certificate (FR20).
 */
export const getReceipt = handle(async (req, res) => {
  const receipt = await paymentService.getReceipt({
    user: req.user,
    paymentId: req.params.id,
  });

  if (req.query.format !== "pdf") {
    return res.status(200).json(receipt);
  }

  const pdf = await renderReceiptPdf(receipt);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="KIT-Receipt-${receipt.receipt_number}.pdf"`
  );
  res.status(200).send(pdf);
});

export const getSubscriptions = handle(async (req, res) => {
  res.status(200).json(
    await paymentService.listSubscriptions({ user: req.user })
  );
});

export const postCancelSubscription = handle(async (req, res) => {
  const result = await paymentService.cancelSubscription({
    user: req.user,
    planId: req.body.plan_id,
  });

  await logActivity({
    actor: actorOf(req),
    action: "cancelled_subscription",
    description: `Cancelled ${result.plan.course_title} for ${result.plan.student_name}`,
    target_type: "subscription",
    target_id: result.plan.id,
    ip: clientIp(req),
  });

  res.status(200).json(result);
});

export const getAdminPayments = handle(async (req, res) => {
  res.status(200).json(
    await paymentService.adminPayments({ user: req.user, query: req.query })
  );
});
