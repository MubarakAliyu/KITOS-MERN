/**
 * The Flutterwave inline checkout (ADR-036).
 *
 * Why inline rather than the hosted redirect: the retained payment modal is a
 * four-step flow, and a full-page redirect would tear it down mid-way and
 * return the parent to a fresh page with no memory of which child or course
 * they had chosen. The inline overlay opens above the modal, so step 3 stays
 * where it was and step 4 follows immediately. The hosted link the API also
 * returns is the fallback for a deployment with no public key configured.
 *
 * The script itself is loaded by `next/script` from the modal rather than
 * injected here, which is what the installed Next guide prescribes for
 * third-party scripts: it loads once per page however many times the modal is
 * opened, and it is not fetched at all in simulated mode or on the many
 * dashboard visits that never reach a checkout.
 */

/** Flutterwave's own CDN build of the v3 inline checkout. */
export const FLUTTERWAVE_SCRIPT = "https://checkout.flutterwave.com/v3.js";

/**
 * The test or live public key, or `null` when none is configured.
 *
 * Written as a direct `process.env.NEXT_PUBLIC_…` reference on purpose: Next
 * inlines these at build time by substituting the literal expression, so
 * reading it through a variable or a destructured `process.env` would leave
 * it undefined in the browser. It is also **frozen at build time** — changing
 * the key on Vercel takes a redeploy, not a restart.
 */
export function publicKey() {
  return process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY || null;
}

/**
 * Opens the overlay and settles when the parent is done with it.
 *
 * Resolves `{ completed: true }` once Flutterwave reports a charge, and
 * `{ completed: false }` if the overlay was dismissed without one. It
 * deliberately reports nothing about the amount or the status: whether a
 * payment is good is the server's judgement, made by re-verifying against
 * Flutterwave's API, and a figure read out of the browser would be worthless
 * as evidence either way. So `completed` decides only whether it is worth
 * asking the server to verify — never what the answer is.
 */
export function openCheckout({ reference, amount, email, name }) {
  const key = publicKey();
  const checkout =
    typeof window === "undefined" ? null : window.FlutterwaveCheckout;

  if (!key || typeof checkout !== "function") {
    return Promise.reject(new Error("Flutterwave checkout is not available"));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed) => {
      if (settled) return;
      settled = true;
      resolve({ completed });
    };

    checkout({
      public_key: key,
      tx_ref: reference,
      amount,
      currency: "NGN",
      payment_options: "card,banktransfer,ussd",
      customer: { email, name },
      customizations: {
        title: "Kids In Tech",
        description: "Course enrolment",
      },
      callback: () => {
        // The documented way to dismiss the overlay from the callback;
        // without it the parent is left looking at a spent checkout.
        window.closePaymentModal?.();
        finish(true);
      },
      // Fires on dismissal, and also after `callback` — `finish` is guarded
      // so the first outcome is the one that counts.
      onclose: () => finish(false),
    });
  });
}
