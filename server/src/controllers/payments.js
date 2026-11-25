import * as paymentService from "../services/payment.service.js";
import { verifyWebhookHash, isSimulated } from "../lib/flutterwave.js";
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
 * `POST /payments/webhook` — public, authenticated by the `verif-hash`
 * header.
 *
 * Flutterwave retries anything that is not a 2xx, so every outcome that is
 * not worth retrying answers 200 — including a hash we reject, which will
 * never become valid however many times it is sent.
 *
 * Two things this deliberately does not do. It does not need the raw body:
 * `verif-hash` is a static secret chosen in the dashboard, not an HMAC over
 * the bytes, so there is nothing for a raw parser to preserve. And it does
 * not act on the body it just authenticated — `handleWebhook` re-verifies
 * the transaction against the API, because a static header secret says
 * nothing about whether the figures in the body are genuine (ADR-036).
 */
export const postPaymentWebhook = handle(async (req, res) => {
  const hash = req.get("verif-hash");

  if (isSimulated()) {
    // No secret key means nothing to re-verify against, so the endpoint
    // cannot be trusted and must not act. Saying so plainly beats appearing
    // to work in an environment where it provably cannot.
    logger.warn(
      "Flutterwave webhook received while in simulated mode; ignoring"
    );
    return res.status(200).json({
      received: true,
      handled: false,
      reason: "Simulated mode: no Flutterwave key to verify against",
    });
  }

  if (!verifyWebhookHash({ hash })) {
    logger.warn(
      { ip: clientIp(req), has_hash: Boolean(hash) },
      "Flutterwave webhook hash rejected"
    );
    // 200, deliberately: a wrong hash is not a transient failure, and a 4xx
    // would have Flutterwave retry it for hours. Nothing is acted on.
    return res.status(200).json({ received: true, handled: false });
  }

  const result = await paymentService.handleWebhook({ event: req.body });
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
