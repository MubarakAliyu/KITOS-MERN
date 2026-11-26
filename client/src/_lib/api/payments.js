import { apiClient } from "./client";

/**
 * Returns payment records visible to the caller. Optional filters narrow the
 * server-side response (parent_id, student_id).
 * @param {{ parent_id?: string, student_id?: string }} [filters]
 */
export async function getPayments(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  const { data } = await apiClient.get(`/payments${qs ? `?${qs}` : ""}`);
  return data;
}

/** Aggregated payment stats — totals, by-type splits, monthly bars. */
export async function getPaymentStats() {
  const { data } = await apiClient.get("/payments/stats");
  return data;
}

/** Returns active and cancelled subscription plans. */
export async function getSubscriptions() {
  const { data } = await apiClient.get("/subscriptions");
  return data;
}

/**
 * Opens a Flutterwave checkout (ADR-036).
 *
 * Returns `{ reference, link, amount, amount_kobo, simulated, payment }`.
 * `link` is the hosted Standard checkout URL; `simulated: true` means the API
 * has no Flutterwave key and the modal should walk its own steps instead.
 *
 * The amount in `payload` is sent for shape compatibility with the retained
 * modal and ignored by the server, which charges the course fee.
 */
export async function initiatePayment(payload) {
  const { data } = await apiClient.post("/payments/initiate", payload);
  return data;
}

/**
 * Verifies a completed Flutterwave transaction and persists the row. Returns
 * the full payment object so the UI can show the receipt without an extra
 * round trip. Safe to call twice: the server confirms exactly once.
 */
export async function verifyPayment(payload) {
  const { data } = await apiClient.post("/payments/verify", payload);
  return data;
}

/** Marks a subscription as cancelled. */
export async function cancelSubscription(planId) {
  const { data } = await apiClient.post("/subscriptions/cancel", {
    plan_id: planId,
  });
  return data;
}

/** Fetches a single receipt with a `receipt_number` field. */
export async function getReceipt(paymentId) {
  const { data } = await apiClient.get(`/payments/${paymentId}/receipt`);
  return data;
}
