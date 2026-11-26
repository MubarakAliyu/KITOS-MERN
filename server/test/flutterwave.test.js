import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetEnvCache } from "../src/config/env.js";
import {
  initializeTransaction,
  isSimulated,
  newReference,
  verifyTransaction,
  verifyWebhookHash,
} from "../src/lib/flutterwave.js";

/**
 * The Flutterwave wrapper on its own (ADR-036).
 *
 * `payments.test.js` covers what the platform does with a payment. This file
 * covers the translation layer underneath it, because that is where the port
 * from Paystack could go wrong quietly: Flutterwave quotes money in naira and
 * KITOS stores kobo, and a factor of a hundred in either direction produces a
 * number that looks like a plausible amount.
 */

const realFetch = globalThis.fetch;

/** ₦15,000 — the seeded fee (ADR-033). */
const FEE_KOBO = 1_500_000;
const FEE_NAIRA = 15_000;

let calls;

function stubApi(data, { envelope = "success", status = 200 } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ status: envelope, data }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const transaction = (overrides = {}) => ({
  tx_ref: "KIT-TEST-1",
  status: "successful",
  currency: "NGN",
  amount: FEE_NAIRA,
  charged_amount: 15_210,
  processor_response: "Approved",
  payment_type: "card",
  flw_ref: "FLW-1",
  ...overrides,
});

const verifyFee = (overrides = {}) =>
  verifyTransaction({
    reference: overrides.reference ?? "KIT-TEST-1",
    expectedAmountKobo: FEE_KOBO,
  });

describe("simulated mode", () => {
  beforeEach(() => {
    delete process.env.FLW_SECRET_KEY;
    resetEnvCache();
  });

  it("is on when no secret key is configured", () => {
    expect(isSimulated()).toBe(true);
  });

  it("initialises without a network call", async () => {
    calls = [];
    globalThis.fetch = async () => {
      throw new Error("simulated mode must not call out");
    };

    const result = await initializeTransaction({
      reference: "KIT-TEST-1",
      amountKobo: FEE_KOBO,
      email: "parent@example.com",
      name: "A Parent",
    });

    expect(result.simulated).toBe(true);
    expect(result.link).toBe("#simulated-payment");

    globalThis.fetch = realFetch;
  });

  /**
   * The simulation reports back the amount it was given rather than one of
   * its own, so the service's amount check still has something real to
   * compare and a mismatch cannot be hidden by running offline.
   */
  it("reports the expected amount, so the amount check still means something", async () => {
    const result = await verifyFee();

    expect(result.status).toBe("success");
    expect(result.amount).toBe(FEE_KOBO);
    expect(result.channel).toBe("simulated");
  });

  it("refuses every webhook hash, because there is nothing to check against", () => {
    expect(verifyWebhookHash({ hash: "anything" })).toBe(false);
  });
});

describe("live mode", () => {
  beforeEach(() => {
    process.env.FLW_SECRET_KEY = "FLWSECK_TEST-unit";
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_WEBHOOK_HASH;
    resetEnvCache();
    globalThis.fetch = realFetch;
  });

  // ── Money, in both directions ────────────────────────────────────────────

  /**
   * The bug this file exists to prevent. Paystack took minor units, so a
   * port that passed `amount_kobo` through unchanged would ask Flutterwave
   * for ₦1,500,000 instead of ₦15,000 — a hundred times the course fee, and
   * a figure plausible enough to reach a parent's card.
   */
  it("asks for the fee in naira, not kobo", async () => {
    stubApi({ link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" });

    await initializeTransaction({
      reference: "KIT-TEST-1",
      amountKobo: FEE_KOBO,
      email: "parent@example.com",
      name: "A Parent",
      redirectUrl: "https://kit.example/parent/payments?tx_ref=KIT-TEST-1",
      metadata: { type: "one_time" },
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].init.body);
    expect(body.amount).toBe(FEE_NAIRA);
    expect(body.currency).toBe("NGN");
    expect(body.tx_ref).toBe("KIT-TEST-1");
    expect(body.customer.email).toBe("parent@example.com");
    expect(calls[0].url).toContain("/v3/payments");
  });

  it("returns the hosted link", async () => {
    const link = "https://checkout.flutterwave.com/v3/hosted/pay/abc";
    stubApi({ link });

    const result = await initializeTransaction({
      reference: "KIT-TEST-1",
      amountKobo: FEE_KOBO,
      email: "parent@example.com",
      name: "A Parent",
    });

    expect(result.link).toBe(link);
    expect(result.simulated).toBe(false);
  });

  /** And the same conversion on the way back. */
  it("converts a verified naira amount back into kobo", async () => {
    stubApi(transaction());

    const result = await verifyFee();

    expect(result.status).toBe("success");
    expect(result.amount).toBe(FEE_KOBO);
    expect(calls[0].url).toContain("/v3/transactions/verify_by_reference");
    expect(calls[0].url).toContain("tx_ref=KIT-TEST-1");
  });

  /**
   * `charged_amount` carries Flutterwave's fee on top. Comparing against it
   * rather than `amount` would reject every genuine payment, so the fixture
   * deliberately sets the two apart and this asserts which one is used.
   */
  it("reads `amount`, never `charged_amount`", async () => {
    stubApi(transaction({ amount: FEE_NAIRA, charged_amount: 99_999 }));

    expect((await verifyFee()).amount).toBe(FEE_KOBO);
  });

  /** Floats are a fact of a naira-denominated API; kobo must stay integral. */
  it("rounds a fractional naira amount to whole kobo", async () => {
    stubApi(transaction({ amount: 15_000.004 }));

    const result = await verifyFee();

    expect(Number.isInteger(result.amount)).toBe(true);
    expect(result.amount).toBe(FEE_KOBO);
  });

  it("leaves the amount undefined when the gateway reports none", async () => {
    stubApi(transaction({ amount: undefined }));

    // Undefined rather than zero: the service only compares an amount the
    // gateway actually stated, and 0 would read as a free payment.
    expect((await verifyFee()).amount).toBeUndefined();
  });

  // ── Status vocabulary ────────────────────────────────────────────────────

  it("translates `successful` into the service's `success`", async () => {
    stubApi(transaction({ status: "successful" }));
    expect((await verifyFee()).status).toBe("success");
  });

  it.each(["failed", "cancelled", "pending"])(
    "passes %s through as a non-success",
    async (reported) => {
      stubApi(transaction({ status: reported }));

      const result = await verifyFee();

      expect(result.status).toBe(reported);
      expect(result.status).not.toBe("success");
    }
  );

  it("reports an unrecognised empty status as `unknown` rather than success", async () => {
    stubApi(transaction({ status: undefined }));
    expect((await verifyFee()).status).toBe("unknown");
  });

  // ── The three refusals ───────────────────────────────────────────────────

  it("refuses a transaction answered under a different reference", async () => {
    stubApi(transaction({ tx_ref: "KIT-SOMEONE-ELSE" }));

    const result = await verifyFee();

    expect(result.status).toBe("reference_mismatch");
    expect(result.gateway_response).toContain("KIT-SOMEONE-ELSE");
  });

  it("refuses a successful charge in another currency", async () => {
    stubApi(transaction({ currency: "USD" }));

    const result = await verifyFee();

    expect(result.status).toBe("currency_mismatch");
    expect(result.gateway_response).toContain("USD");
  });

  /** An error envelope can arrive with a 200, so the envelope is checked too. */
  it("throws when the gateway reports an error envelope", async () => {
    stubApi(null, { envelope: "error" });

    await expect(verifyFee()).rejects.toThrow();
  });

  it("throws on a non-2xx response", async () => {
    stubApi(null, { status: 500 });

    await expect(verifyFee()).rejects.toThrow();
  });

  // ── The webhook hash ─────────────────────────────────────────────────────

  describe("the webhook hash", () => {
    beforeEach(() => {
      process.env.FLW_WEBHOOK_HASH = "the-dashboard-secret";
      resetEnvCache();
    });

    it("accepts the configured hash", () => {
      expect(verifyWebhookHash({ hash: "the-dashboard-secret" })).toBe(true);
    });

    it.each([
      ["a shorter guess", "the-dashboard"],
      ["a longer guess", "the-dashboard-secret-plus"],
      ["the right length but wrong bytes", "the-dashboard-secrex"],
      ["an empty string", ""],
      ["nothing at all", undefined],
    ])("rejects %s without throwing", (_label, hash) => {
      expect(verifyWebhookHash({ hash })).toBe(false);
    });
  });

  it("refuses any hash when none is configured", () => {
    delete process.env.FLW_WEBHOOK_HASH;
    resetEnvCache();

    // The safe default: a deployment that forgets the hash gets a webhook
    // that trusts nobody, not one that trusts everybody.
    expect(verifyWebhookHash({ hash: "anything" })).toBe(false);
  });
});

describe("references", () => {
  it("are unique and prefixed, so a seeded row cannot collide with a live one", () => {
    const refs = new Set(Array.from({ length: 500 }, () => newReference()));

    expect(refs.size).toBe(500);
    for (const ref of refs) expect(ref).toMatch(/^KIT-[0-9A-Z]+$/);
  });
});
