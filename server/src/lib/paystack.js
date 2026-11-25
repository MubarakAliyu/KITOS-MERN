import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Paystack, behind one wrapper (PRD §11.1).
 *
 * Two modes, chosen by whether `PAYSTACK_SECRET_KEY` is set:
 *
 *   - **live** (test keys count as live here) calls api.paystack.co;
 *   - **simulated** returns a plausible response without a network call.
 *
 * Simulated mode is not a mock in the testing sense — it is a supported way
 * to run the whole platform, and NFR6 requires it: the project must work
 * locally with no external accounts. The retained four-step payment modal
 * runs end to end against it, and the confirmation path it exercises is the
 * same code a real payment takes. What changes is only where the "did this
 * transaction succeed?" answer comes from.
 *
 * A simulated payment is marked `confirmed_via: "simulated"` so no receipt
 * can later be mistaken for one Paystack actually settled.
 */

const BASE_URL = "https://api.paystack.co";

export function isSimulated() {
  return !env.PAYSTACK_SECRET_KEY;
}

export const mode = () => (isSimulated() ? "simulated" : "live");

/** `KIT-<26 chars>`: sortable by time, unique without coordination. */
export function newReference() {
  const time = Date.now().toString(36).toUpperCase().padStart(9, "0");
  const random = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `KIT-${time}${random}`;
}

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    // Paystack is usually quick; a hung request must not hold a child's
    // checkout open for ever.
    signal: AbortSignal.timeout(20000),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok || parsed?.status === false) {
    const message = parsed?.message ?? `Paystack returned ${response.status}`;
    logger.error({ path, status: response.status, message }, "Paystack call failed");
    const err = new Error(message);
    err.paystackStatus = response.status;
    throw err;
  }

  return parsed?.data ?? parsed;
}

/**
 * Opens a transaction.
 *
 * The amount is in kobo and comes from the course, never from the browser.
 */
export async function initializeTransaction({ reference, amountKobo, email, callbackUrl, metadata }) {
  if (isSimulated()) {
    return {
      reference,
      access_code: `sim_${reference.toLowerCase()}`,
      // A real Paystack popup opens this. In simulated mode the modal walks
      // its own four steps and never navigates, so the anchor the retained
      // UI already used is right.
      authorization_url: "#simulated-payment",
      simulated: true,
    };
  }

  return call("/transaction/initialize", {
    method: "POST",
    body: {
      reference,
      amount: amountKobo,
      email,
      callback_url: callbackUrl,
      metadata,
    },
  });
}

/**
 * Asks Paystack what happened to a transaction.
 *
 * In simulated mode this answers "success" for the amount we recorded, which
 * is what lets the four-step modal complete offline. It deliberately reports
 * the amount from the caller rather than inventing one, so an amount mismatch
 * cannot be masked by the simulation.
 */
export async function verifyTransaction({ reference, expectedAmountKobo }) {
  if (isSimulated()) {
    return {
      reference,
      status: "success",
      amount: expectedAmountKobo,
      gateway_response: "Simulated approval (no Paystack key configured)",
      channel: "simulated",
      simulated: true,
    };
  }

  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/**
 * Checks a webhook's `x-paystack-signature`.
 *
 * HMAC-SHA512 of the **raw** body with the secret key. The raw bytes matter:
 * re-serialising the parsed JSON changes key order and whitespace, and the
 * signature would never match — which is why the webhook route is mounted
 * with a raw body parser.
 *
 * `timingSafeEqual` rather than `===`, so the comparison does not leak how
 * much of a forged signature was correct.
 */
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!env.PAYSTACK_SECRET_KEY) return false;
  if (!signature || !rawBody) return false;

  const expected = crypto
    .createHmac("sha512", env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const given = Buffer.from(String(signature), "utf8");
  const mine = Buffer.from(expected, "utf8");

  if (given.length !== mine.length) return false;
  return crypto.timingSafeEqual(given, mine);
}
