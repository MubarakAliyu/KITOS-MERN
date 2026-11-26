import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { koboToNaira, nairaToKobo } from "./serialize.js";

/**
 * Flutterwave v3, behind one wrapper (PRD §11.1, ADR-036).
 *
 * This replaced Paystack when KIT's Paystack compliance review stalled and
 * the school's Flutterwave account was already verified. Every rule the
 * payment service enforces is unchanged; only the gateway behind it moved.
 *
 * Two modes, chosen by whether `FLW_SECRET_KEY` is set:
 *
 *   - **live** (test keys count as live here) calls api.flutterwave.com;
 *   - **simulated** returns a plausible response without a network call.
 *
 * Simulated mode is not a mock in the testing sense — it is a supported way
 * to run the whole platform, and NFR6 requires it: the project must work
 * locally, and in CI, with no external accounts. The retained four-step
 * payment modal runs end to end against it, and the confirmation path it
 * exercises is the same code a real payment takes. What changes is only
 * where the "did this transaction succeed?" answer comes from.
 *
 * A simulated payment is marked `confirmed_via: "simulated"` so no receipt
 * can later be mistaken for one Flutterwave actually settled.
 *
 * ## Two differences from Paystack that would be bugs if missed
 *
 * 1. **Flutterwave speaks naira; KITOS stores kobo.** v3 amounts are in
 *    major units — `amount: 7500` is ₦7,500, not ₦75. Paystack's were minor
 *    units, so a port that passed `amount_kobo` straight through would
 *    charge a family one hundred times the course fee. Every amount is
 *    converted at this boundary and nowhere else: the rest of the server
 *    continues to see kobo, so `payment.service.js` compares integers to
 *    integers and is unaware a conversion happened.
 *
 * 2. **`status` is `"successful"`, not `"success"`,** and a failed charge may
 *    report `"failed"` or `"cancelled"`. The service's vocabulary is
 *    Paystack's, so this module normalises to it rather than spreading a
 *    second set of strings through the business rules.
 */

const BASE_URL = "https://api.flutterwave.com";

/** The only currency KIT charges in. Anything else is not our transaction. */
const CURRENCY = "NGN";

export function isSimulated() {
  return !env.FLW_SECRET_KEY;
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
      Authorization: `Bearer ${env.FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    // Flutterwave is usually quick; a hung request must not hold a child's
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

  // v3 answers `{ status: "success" | "error", message, data }`, and an error
  // can arrive with a 200, so the envelope is checked as well as the code.
  if (!response.ok || parsed?.status === "error") {
    const message = parsed?.message ?? `Flutterwave returned ${response.status}`;
    logger.error(
      { path, status: response.status, message },
      "Flutterwave call failed"
    );
    const err = new Error(message);
    err.flutterwaveStatus = response.status;
    throw err;
  }

  return parsed?.data ?? parsed;
}

/**
 * Opens a transaction — Standard checkout, `POST /v3/payments`.
 *
 * Returns a hosted payment link. The amount is in kobo on the way in and
 * comes from the course, never from the browser; it is converted to naira
 * here because that is what v3 expects.
 *
 * `tx_ref` is our own `KIT-…` reference, which is what makes
 * `verify_by_reference` usable later and what ties the webhook back to a row
 * we created.
 */
export async function initializeTransaction({
  reference,
  amountKobo,
  email,
  name,
  redirectUrl,
  metadata,
}) {
  if (isSimulated()) {
    return {
      reference,
      // A real Flutterwave checkout opens this. In simulated mode the modal
      // walks its own four steps and never navigates, so the inert anchor
      // the retained UI already used is right.
      link: "#simulated-payment",
      simulated: true,
    };
  }

  const data = await call("/v3/payments", {
    method: "POST",
    body: {
      tx_ref: reference,
      amount: koboToNaira(amountKobo),
      currency: CURRENCY,
      redirect_url: redirectUrl,
      customer: {
        // Flutterwave requires an email; a child has none (FR16, PRD §10),
        // so the paying parent's address is the right one, and the one a
        // receipt should reach anyway.
        email,
        name,
      },
      customizations: {
        title: "Kids In Tech",
        description: "Course enrolment",
      },
      meta: metadata,
    },
  });

  return { reference, link: data?.link, simulated: false };
}

/**
 * Asks Flutterwave what happened to a transaction, by our own reference.
 *
 * `verify_by_reference` rather than verify-by-id, because the id is only
 * known to whoever received the callback, and the webhook path must be able
 * to re-verify from the reference alone.
 *
 * Returns the service's vocabulary: `status: "success"`, and `amount` in
 * **kobo**. Four things are checked here, and any of them failing reports a
 * status the service will record as a failed payment rather than a paid one:
 *
 *   - the gateway says the charge succeeded;
 *   - it is denominated in naira;
 *   - the reference it answers about is the one we asked about;
 *   - (the amount itself is compared in the service, which knows the fee).
 *
 * `amount` is the figure to compare, never `charged_amount`: the latter
 * includes Flutterwave's fee, so a correct ₦20,000 payment reports a charged
 * amount of about ₦20,280 and an amount check against it would reject every
 * genuine payment.
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
      currency: CURRENCY,
      gateway_response: "Simulated approval (no Flutterwave key configured)",
      channel: "simulated",
      simulated: true,
    };
  }

  const data = await call(
    `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
  );

  const reported = String(data?.status ?? "").toLowerCase();
  const currency = String(data?.currency ?? "").toUpperCase();
  const returnedRef = data?.tx_ref ?? null;

  /**
   * The reference must be the one we asked about.
   *
   * It should be, but "should" is doing a lot of work in a money path: a
   * provider answering about a different transaction, or a future change to
   * how the query is built, would otherwise confirm the wrong payment.
   */
  if (returnedRef && String(returnedRef) !== String(reference)) {
    logger.error(
      { reference, returnedRef },
      "Flutterwave verified a different reference than the one requested"
    );
    return {
      reference,
      status: "reference_mismatch",
      gateway_response: `Gateway answered about ${returnedRef}, not ${reference}`,
      channel: data?.payment_type ?? null,
    };
  }

  if (reported === "successful" && currency && currency !== CURRENCY) {
    logger.error(
      { reference, currency },
      "Refusing a payment that was not denominated in naira"
    );
    return {
      reference,
      status: "currency_mismatch",
      gateway_response: `Paid in ${currency}, not ${CURRENCY}`,
      channel: data?.payment_type ?? null,
    };
  }

  return {
    reference,
    // `successful` is Flutterwave's word for it; the service speaks
    // `success`. Everything else (failed, cancelled, pending) passes through
    // and lands in the service's "not a success" branch.
    status: reported === "successful" ? "success" : reported || "unknown",
    // Naira in, kobo out. `nairaToKobo` rounds, so a gateway that reports
    // 20000.0 and one that reports 19999.999999 both compare equal to a
    // ₦20,000 fee instead of failing on a float.
    amount:
      typeof data?.amount === "number" ? nairaToKobo(data.amount) : undefined,
    currency: currency || null,
    gateway_response:
      data?.processor_response ?? data?.narration ?? `Flutterwave: ${reported}`,
    channel: data?.payment_type ?? null,
    flw_ref: data?.flw_ref ?? null,
  };
}

/**
 * Checks a webhook's `verif-hash` header against `FLW_WEBHOOK_HASH`.
 *
 * Flutterwave's webhook authentication is **not** a signature: the header
 * carries the same static secret on every request, chosen in the dashboard.
 * That is weaker than Paystack's HMAC in a way that matters — it proves the
 * sender knows the secret, but says nothing about whether the body arrived
 * intact or is a replay of an older one. So a matching hash is treated here
 * as "this request is worth looking at", and never as "these figures are
 * true": `handleWebhook` re-verifies the transaction against the API and
 * acts only on what the API says. See ADR-036.
 *
 * `timingSafeEqual` rather than `===`, so the comparison does not leak how
 * much of a guessed secret was correct.
 */
export function verifyWebhookHash({ hash }) {
  if (!env.FLW_WEBHOOK_HASH) return false;
  if (!hash) return false;

  const given = Buffer.from(String(hash), "utf8");
  const mine = Buffer.from(env.FLW_WEBHOOK_HASH, "utf8");

  // Lengths differing is itself a mismatch, and `timingSafeEqual` throws on
  // unequal lengths rather than returning false.
  if (given.length !== mine.length) return false;
  return crypto.timingSafeEqual(given, mine);
}
