import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Payment } from "../src/models/Payment.js";
import { Subscription } from "../src/models/Subscription.js";
import { Notification } from "../src/models/Notification.js";
import { ActivityLog } from "../src/models/ActivityLog.js";
import { Counter } from "../src/models/Counter.js";
import { resetEnvCache } from "../src/config/env.js";
import { verifyWebhookHash } from "../src/lib/flutterwave.js";

let server;

/**
 * The real `fetch`, kept so a test that stubs Flutterwave's API can restore
 * it. Without this a stub leaks into every later test in the file, and the
 * failure shows up somewhere unrelated.
 */
const realFetch = globalThis.fetch;

beforeEach(async () => {
  await resetState();
  server = app();
});

/** ₦15,000, the seeded fee (ADR-033). */
const FEE_KOBO = 1_500_000;

async function makeCourse(overrides = {}) {
  const instructor = await makeUser({ role: "instructor" });
  return Course.create({
    title: "Scratch Programming",
    programme_track: "scratch",
    instructor_id: instructor._id,
    status: "published",
    price_kobo: FEE_KOBO,
    payment_type: "one_time",
    ...overrides,
  });
}

const initiate = (parent, body) =>
  request(server).post("/payments/initiate").set(auth(parent)).send(body);

const verify = (parent, body) =>
  request(server).post("/payments/verify").set(auth(parent)).send(body);

/** Opens a payment and returns its reference. */
async function openPayment({ parent, student, course, type = "one_time" }) {
  const res = await initiate(parent, {
    student_id: String(student._id),
    course_id: String(course._id),
    type,
  });
  expect(res.status).toBe(201);
  return res.body.reference;
}

// ── Opening a payment ───────────────────────────────────────────────────────

describe("initiating a payment", () => {
  it("creates a pending payment and returns a reference", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();

    const res = await initiate(parent, {
      student_id: String(student._id),
      course_id: String(course._id),
    });

    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^KIT-/);
    expect(res.body.simulated).toBe(true);
    expect(res.body.amount).toBe(15000);

    const payment = await Payment.findOne({ tx_ref: res.body.reference });
    expect(payment.status).toBe("pending");
    expect(payment.amount_kobo).toBe(FEE_KOBO);
    // Snapshotted, so a later rename cannot rewrite a receipt.
    expect(payment.course_title).toBe("Scratch Programming");
    expect(payment.student_admission_no).toBeTruthy();
  });

  /**
   * The whole of the vulnerability, if it were not closed: a browser that
   * could set the price would pay ₦1 for a ₦15,000 course.
   */
  it("ignores the amount the browser sends and charges the course fee", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();

    const res = await initiate(parent, {
      student_id: String(student._id),
      course_id: String(course._id),
      amount: 1,
    });

    expect(res.status).toBe(201);
    const payment = await Payment.findOne({ tx_ref: res.body.reference });
    expect(payment.amount_kobo).toBe(FEE_KOBO);
  });

  it("refuses a parent paying for another family's child", async () => {
    const mine = await makeFamily();
    const theirs = await makeFamily({ childOverrides: { name: "Other Child" } });
    const course = await makeCourse();

    const res = await initiate(mine.parent, {
      student_id: String(theirs.student._id),
      course_id: String(course._id),
    });

    expect(res.status).toBe(403);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("refuses a course with no fee set", async () => {
    const { parent, student } = await makeFamily();
    const free = await makeCourse({ price_kobo: 0 });

    const res = await initiate(parent, {
      student_id: String(student._id),
      course_id: String(free._id),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no fee set/i);
  });

  it("is refused to a role that cannot pay", async () => {
    const { student } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    const course = await makeCourse();

    const res = await initiate(instructor, {
      student_id: String(student._id),
      course_id: String(course._id),
    });

    expect(res.status).toBe(403);
  });
});

// ── Confirming it, exactly once (AC3.3) ─────────────────────────────────────

describe("confirming a payment", () => {
  it("marks it paid, issues a receipt, and activates the enrolment", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const res = await verify(parent, { reference });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.payment.status).toBe("paid");
    expect(res.body.payment.receipt_no).toMatch(/^RCP-\d{6}-\d{4}$/);
    // Simulated, and labelled as such, so no receipt can be mistaken for one
    // the gateway settled.
    expect(res.body.payment.confirmed_via).toBe("simulated");

    const enrolment = await Enrollment.findOne({
      student_id: student._id,
      course_id: course._id,
    });
    expect(enrolment.status).toBe("active");
    expect(enrolment.source).toBe("payment");

    // The parent and every admin hear about it, and it is audited.
    expect(
      await Notification.countDocuments({
        user_id: parent._id,
        type: "payment_success",
      })
    ).toBe(1);
    expect(
      await ActivityLog.countDocuments({ action: "payment_confirmed" })
    ).toBe(1);
  });

  it("opens a subscription for a subscription payment, and not for a one-off", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse({ payment_type: "subscription" });

    const subscriptionRef = await openPayment({
      parent,
      student,
      course,
      type: "subscription",
    });
    await verify(parent, { reference: subscriptionRef });

    const plan = await Subscription.findOne({ student_id: student._id });
    expect(plan.status).toBe("active");
    expect(plan.amount_kobo).toBe(FEE_KOBO);
    expect(plan.next_billing).toBeTruthy();

    const other = await makeCourse({ title: "One Off" });
    const oneOffRef = await openPayment({
      parent,
      student,
      course: other,
      type: "one_time",
    });
    await verify(parent, { reference: oneOffRef });

    expect(await Subscription.countDocuments({})).toBe(1);
  });

  it("is idempotent when verify is called twice", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const first = await verify(parent, { reference });
    const second = await verify(parent, { reference });

    expect(first.body.already_confirmed).toBe(false);
    expect(second.body.already_confirmed).toBe(true);
    // Same receipt, not a second one.
    expect(second.body.payment.receipt_no).toBe(first.body.payment.receipt_no);

    expect(await Enrollment.countDocuments({})).toBe(1);
    expect(
      await Notification.countDocuments({
        user_id: parent._id,
        type: "payment_success",
      })
    ).toBe(1);
    expect(
      await ActivityLog.countDocuments({ action: "payment_confirmed" })
    ).toBe(1);
  });

  /**
   * AC3.3, the case the acceptance criteria name: verify and the webhook both
   * arrive, sometimes within milliseconds. One paid payment, one receipt, one
   * enrolment, one notification.
   */
  it("is idempotent when verify and the webhook race", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { handleWebhook } = await import("../src/services/payment.service.js");

    /**
     * Note what the webhook event carries: a reference and nothing else.
     * Since ADR-036 the body is only a prompt to go and ask the API, so a
     * status or an amount here would be ignored — and in simulated mode the
     * gateway answers for the fee on the row, which is the same path a live
     * re-verification takes.
     */
    const [viaVerify, viaWebhook] = await Promise.all([
      verify(parent, { reference }),
      handleWebhook({
        event: { event: "charge.completed", data: { tx_ref: reference } },
      }),
    ]);

    expect(viaVerify.status).toBe(200);
    expect(viaWebhook.received).toBe(true);

    const payments = await Payment.find({ tx_ref: reference });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("paid");

    // Exactly one of the two did the work.
    const confirmedTwice =
      viaVerify.body.already_confirmed === false &&
      viaWebhook.already_confirmed === false;
    expect(confirmedTwice).toBe(false);

    expect(await Enrollment.countDocuments({})).toBe(1);
    expect(
      await Notification.countDocuments({
        user_id: parent._id,
        type: "payment_success",
      })
    ).toBe(1);
    expect(
      await ActivityLog.countDocuments({ action: "payment_confirmed" })
    ).toBe(1);

    // And one receipt number was consumed, not two.
    const counters = await Counter.find({ _id: /^receipt:/ });
    expect(counters[0].seq).toBe(1);
  });

  /**
   * The window between claiming a payment and writing its receipt number.
   *
   * Found by racing two verifies over HTTP against the running API: the
   * loser was told `already_confirmed: true` and handed a paid payment whose
   * `receipt_no` was still null, which the success screen and the receipt
   * modal both render. The unit test for the same race never caught it,
   * because the in-memory replica set settles the transaction before the
   * second caller gets a chance to look.
   *
   * So this opens the window deliberately rather than hoping to hit it: a
   * row that is already `paid` with no number yet, and a number that arrives
   * shortly afterwards, exactly as the winning caller's transaction would
   * deliver it.
   */
  it("waits for the receipt number rather than reporting a half-written row", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { confirmPayment } = await import("../src/services/payment.service.js");

    // Mid-confirmation: claimed by someone else, number not written yet.
    await Payment.updateOne(
      { tx_ref: reference },
      { $set: { status: "paid", paid_at: new Date(), confirmed_via: "verify" } }
    );

    const writeNumberSoon = new Promise((resolve) => {
      setTimeout(async () => {
        await Payment.updateOne(
          { tx_ref: reference },
          { $set: { receipt_no: "RCP-209901-0001" } }
        );
        resolve();
      }, 150);
    });

    const [result] = await Promise.all([
      confirmPayment({ reference, via: "webhook", gatewayData: {} }),
      writeNumberSoon,
    ]);

    expect(result.already_confirmed).toBe(true);
    expect(result.payment.receipt_no).toBe("RCP-209901-0001");
  });

  /**
   * And the other half of the same guard: a failed payment has no receipt
   * number coming either, so waiting on one would add the full timeout to
   * every declined card.
   */
  it("does not wait on a failed payment that will never have a number", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { confirmPayment } = await import("../src/services/payment.service.js");

    await confirmPayment({
      reference,
      via: "webhook",
      gatewayData: { status: "failed", gateway_response: "Declined" },
    });

    const started = Date.now();
    const result = await confirmPayment({
      reference,
      via: "webhook",
      gatewayData: { status: "failed" },
    });
    const elapsed = Date.now() - started;

    expect(result.payment.status).toBe("failed");
    // Comfortably under the 3s deadline the wait would otherwise burn.
    expect(elapsed).toBeLessThan(1000);
  });

  it("issues each payment its own receipt number", async () => {
    const { parent, student } = await makeFamily();
    const a = await makeCourse({ title: "Course A" });
    const b = await makeCourse({ title: "Course B" });

    const first = await verify(parent, {
      reference: await openPayment({ parent, student, course: a }),
    });
    const second = await verify(parent, {
      reference: await openPayment({ parent, student, course: b }),
    });

    expect(first.body.payment.receipt_no).not.toBe(
      second.body.payment.receipt_no
    );
  });

  it("refuses a reference it never issued", async () => {
    const { parent } = await makeFamily();

    const res = await verify(parent, { reference: "KIT-NOT-A-REAL-REFERENCE" });

    expect(res.status).toBe(404);
  });

  it("refuses to verify another family's payment", async () => {
    const mine = await makeFamily();
    const theirs = await makeFamily({ childOverrides: { name: "Other Child" } });
    const course = await makeCourse();

    const reference = await openPayment({
      parent: theirs.parent,
      student: theirs.student,
      course,
    });

    const res = await verify(mine.parent, { reference });

    expect(res.status).toBe(403);
  });

  /**
   * Without this an attacker could open a ₦25,000 enrolment, pay ₦100 on
   * their own Flutterwave account and present that reference.
   */
  it("refuses a payment whose amount does not match the course fee", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { confirmPayment } = await import("../src/services/payment.service.js");

    await expect(
      confirmPayment({
        reference,
        via: "webhook",
        gatewayData: { status: "success", amount: 10_000 },
      })
    ).rejects.toThrow(/does not match the course fee/i);

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(await Enrollment.countDocuments({})).toBe(0);
  });

  it("marks a payment failed when the gateway says it did not succeed", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { confirmPayment } = await import("../src/services/payment.service.js");

    await confirmPayment({
      reference,
      via: "webhook",
      gatewayData: { status: "abandoned", gateway_response: "Cancelled" },
    });

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(await Enrollment.countDocuments({})).toBe(0);
  });
});

// ── The webhook ─────────────────────────────────────────────────────────────

describe("the Flutterwave webhook", () => {
  const SECRET = "FLWSECK_TEST-for-tests";
  const HASH = "a-secret-hash-set-in-the-dashboard";
  const WEBHOOK_REF = "KIT-WEBHOOK-TEST-0001";

  /** Live mode: the hash can only be checked when one is configured. */
  beforeEach(() => {
    process.env.FLW_SECRET_KEY = SECRET;
    process.env.FLW_WEBHOOK_HASH = HASH;
    resetEnvCache();
    server = app();
  });

  afterEach(() => {
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_WEBHOOK_HASH;
    resetEnvCache();
    globalThis.fetch = realFetch;
  });

  /** One transaction as `verify_by_reference` reports it. Amounts in naira. */
  const transaction = (overrides = {}) => ({
    tx_ref: WEBHOOK_REF,
    status: "successful",
    currency: "NGN",
    // 15,000 naira - the fee, in Flutterwave's units, not kobo.
    amount: 15000,
    // Includes Flutterwave's cut. Comparing against this instead of `amount`
    // would reject every genuine payment, so a fixture that differs from
    // `amount` is the point.
    charged_amount: 15210,
    processor_response: "Approved",
    payment_type: "card",
    flw_ref: "FLW-TEST-REF-1",
    ...overrides,
  });

  /**
   * Flutterwave's API, stubbed, returning `data` and recording its calls.
   *
   * Every webhook test needs one: since ADR-036 the webhook ignores the body
   * it was sent and asks the API what actually happened. The recorded calls
   * are what let a test prove the network was *not* reached.
   */
  function stubApi(data, { envelope = "success" } = {}) {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ status: envelope, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    return calls;
  }

  const post = (body, hash) =>
    request(server)
      .post("/payments/webhook")
      .set(hash ? { "verif-hash": hash } : {})
      .send(body);

  /** A pending payment, written directly: this is not a test of initiate. */
  async function pendingPayment() {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const payment = await Payment.create({
      tx_ref: WEBHOOK_REF,
      parent_id: parent._id,
      student_id: student._id,
      course_id: course._id,
      parent_name: parent.name,
      student_name: student.name,
      course_title: course.title,
      amount_kobo: FEE_KOBO,
      type: "one_time",
      status: "pending",
    });
    return { reference: payment.tx_ref, parent, student, course };
  }

  const event = (overrides = {}) => ({
    event: "charge.completed",
    data: { tx_ref: WEBHOOK_REF, ...overrides },
  });

  it("confirms a charge.completed when the hash matches and the API agrees", async () => {
    const { reference, student, course } = await pendingPayment();
    const calls = stubApi(transaction());

    const res = await post(event(), HASH);

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("paid");
    expect(payment.confirmed_via).toBe("webhook");
    // A fee reported in naira was stored as kobo, neither multiplied by a
    // hundred nor divided by one.
    expect(payment.amount_kobo).toBe(FEE_KOBO);

    expect(
      await Enrollment.countDocuments({
        student_id: student._id,
        course_id: course._id,
        status: "active",
      })
    ).toBe(1);

    // It really did re-verify, by reference.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/v3/transactions/verify_by_reference");
    expect(calls[0]).toContain(reference);
  });

  it("ignores a wrong hash, and answers 200 so Flutterwave stops retrying", async () => {
    const { reference } = await pendingPayment();
    const calls = stubApi(transaction());

    const res = await post(event(), HASH + "-wrong");

    // 200 deliberately: a wrong hash will never become right, and a 4xx
    // would earn hours of retries.
    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ tx_ref: reference })).status).toBe(
      "pending"
    );
    // Rejected before the gateway was ever asked.
    expect(calls).toHaveLength(0);
  });

  it("ignores a missing hash", async () => {
    const { reference } = await pendingPayment();
    const calls = stubApi(transaction());

    const res = await post(event(), null);

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ tx_ref: reference })).status).toBe(
      "pending"
    );
    expect(calls).toHaveLength(0);
  });

  /**
   * The reason the re-verification exists (ADR-036).
   *
   * `verif-hash` is a static secret, so anyone who learns it can send any
   * body they like. Here the body claims a successful full-fee charge and
   * the API says the transaction failed. The API wins.
   */
  it("does not trust a correctly hashed body the API contradicts", async () => {
    const { reference } = await pendingPayment();
    stubApi(transaction({ status: "failed", processor_response: "Declined" }));

    const res = await post(
      event({ status: "successful", amount: 15000, charged_amount: 15000 }),
      HASH
    );

    expect(res.status).toBe(200);
    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(payment.gateway_response).toMatch(/declined/i);
    expect(await Enrollment.countDocuments({})).toBe(0);
  });

  /**
   * The same attack by the other route: a body claiming the full fee while
   * the transaction the API knows about was for 100 naira.
   */
  it("refuses a re-verified amount that does not match the course fee", async () => {
    const { reference } = await pendingPayment();
    stubApi(transaction({ amount: 100 }));

    const res = await post(event({ amount: 15000 }), HASH);

    // The service throws, so the endpoint reports an error rather than
    // quietly swallowing it. Nothing is confirmed either way.
    expect(res.status).toBeGreaterThanOrEqual(400);

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(payment.gateway_response).toMatch(/mismatch/i);
    expect(await Enrollment.countDocuments({})).toBe(0);
  });

  it("refuses a transaction paid in another currency", async () => {
    const { reference } = await pendingPayment();
    stubApi(transaction({ currency: "USD", amount: 15000 }));

    await post(event(), HASH);

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(payment.gateway_response).toMatch(/USD/);
    expect(await Enrollment.countDocuments({})).toBe(0);
  });

  it("refuses a transaction the gateway answers about under another reference", async () => {
    const { reference } = await pendingPayment();
    stubApi(transaction({ tx_ref: "KIT-SOMEONE-ELSES-REF" }));

    await post(event(), HASH);

    const payment = await Payment.findOne({ tx_ref: reference });
    expect(payment.status).toBe("failed");
    expect(await Enrollment.countDocuments({})).toBe(0);
  });

  it("is a no-op when replayed, however many times", async () => {
    await pendingPayment();
    stubApi(transaction());

    const first = await post(event(), HASH);
    const second = await post(event(), HASH);
    const third = await post(event(), HASH);

    expect(first.body.already_confirmed).toBe(false);
    expect(second.body.already_confirmed).toBe(true);
    expect(third.body.already_confirmed).toBe(true);

    expect(await Enrollment.countDocuments({})).toBe(1);
    expect(
      await ActivityLog.countDocuments({ action: "payment_confirmed" })
    ).toBe(1);
  });

  it("ignores an event type it does not act on", async () => {
    const { reference } = await pendingPayment();
    const calls = stubApi(transaction());

    const res = await post(
      { event: "transfer.completed", data: { tx_ref: reference } },
      HASH
    );

    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ tx_ref: reference })).status).toBe(
      "pending"
    );
    expect(calls).toHaveLength(0);
  });

  it("ignores a reference it never issued, without calling the gateway", async () => {
    const calls = stubApi(transaction());

    const res = await post(event({ tx_ref: "KIT-NEVER-ISSUED" }), HASH);

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    // An unknown reference must not become a way to make us call out.
    expect(calls).toHaveLength(0);
  });

  it("ignores an event with no reference at all", async () => {
    const res = await post({ event: "charge.completed", data: {} }, HASH);

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
  });

  it("rejects a hash of the wrong length without throwing", () => {
    // `timingSafeEqual` throws on unequal lengths, so the length check is
    // not an optimisation - without it this is a 500 on every short guess.
    expect(verifyWebhookHash({ hash: "short" })).toBe(false);
    expect(verifyWebhookHash({ hash: HASH + "-longer" })).toBe(false);
    expect(verifyWebhookHash({ hash: HASH })).toBe(true);
  });
});


describe("the webhook in simulated mode", () => {
  /**
   * With no secret key there is nothing to re-verify against, so the
   * endpoint must not act. Appearing to work where it provably cannot is
   * worse than saying so.
   *
   * This is also what keeps the endpoint safe by default: a deployment that
   * forgets `FLW_WEBHOOK_HASH` does not get a webhook that trusts anyone.
   */
  it("refuses to act, and says why", async () => {
    const res = await request(server)
      .post("/payments/webhook")
      .send({ event: "charge.completed", data: { tx_ref: "x" } });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/simulated mode/i);
  });
});

// ── Reads ───────────────────────────────────────────────────────────────────

describe("reading payments", () => {
  async function paidPayment() {
    const family = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({
      parent: family.parent,
      student: family.student,
      course,
    });
    const res = await verify(family.parent, { reference });
    return { ...family, course, payment: res.body.payment };
  }

  it("shows a parent their own and nobody else's", async () => {
    const mine = await paidPayment();
    await paidPayment();

    const res = await request(server).get("/payments").set(auth(mine.parent));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(mine.payment.id);
  });

  it("shows an admin every payment", async () => {
    await paidPayment();
    await paidPayment();
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/payments").set(auth(admin));

    expect(res.body).toHaveLength(2);
  });

  it("ignores a parent_id filter that would widen what a parent sees", async () => {
    const mine = await paidPayment();
    const theirs = await paidPayment();

    const res = await request(server)
      .get(`/payments?parent_id=${theirs.parent._id}`)
      .set(auth(mine.parent));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(mine.payment.id);
  });

  it("reports stats with six months of buckets, even empty ones", async () => {
    const { parent } = await paidPayment();

    const res = await request(server).get("/payments/stats").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body.total_revenue).toBe(15000);
    expect(res.body.one_time_revenue).toBe(15000);
    expect(res.body.subscription_revenue).toBe(0);
    // The chart draws six bars; a month with no revenue is a gap, not a
    // missing category.
    expect(res.body.monthly_data).toHaveLength(6);
    expect(res.body.monthly_data.at(-1).one_time).toBe(15000);
  });

  it("serves a receipt to the owner and refuses a stranger", async () => {
    const { parent, payment } = await paidPayment();
    const stranger = await makeUser({ role: "parent" });

    const ok = await request(server)
      .get(`/payments/${payment.id}/receipt`)
      .set(auth(parent));
    expect(ok.status).toBe(200);
    expect(ok.body.receipt_number).toBe(payment.receipt_no);
    expect(ok.body.student_admission_no).toBeTruthy();

    const refused = await request(server)
      .get(`/payments/${payment.id}/receipt`)
      .set(auth(stranger));
    expect(refused.status).toBe(403);
  });

  it("renders the receipt as a PDF", async () => {
    const { parent, payment } = await paidPayment();

    const res = await request(server)
      .get(`/payments/${payment.id}/receipt?format=pdf`)
      .set(auth(parent))
      .buffer()
      .parse((response, callback) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.body.length).toBeGreaterThan(1000);

    // FR20: both marks are on it. Each PNG embeds as an image plus its alpha
    // mask, so two logos are four XObjects — a logo that silently failed to
    // load would still render a receipt, and this is what catches it.
    const pdf = res.body.toString("latin1");
    expect(pdf.match(/\/Subtype\s*\/Image/g) ?? []).toHaveLength(4);
  });

  it("has no receipt for a payment that was never paid", async () => {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });
    const pending = await Payment.findOne({ tx_ref: reference });

    const res = await request(server)
      .get(`/payments/${pending._id}/receipt`)
      .set(auth(parent));

    expect(res.status).toBe(400);
  });
});

describe("subscriptions", () => {
  async function activePlan() {
    const family = await makeFamily();
    const course = await makeCourse({ payment_type: "subscription" });
    const reference = await openPayment({
      parent: family.parent,
      student: family.student,
      course,
      type: "subscription",
    });
    await verify(family.parent, { reference });
    const plan = await Subscription.findOne({ student_id: family.student._id });
    return { ...family, course, plan };
  }

  it("lists a parent's own plans", async () => {
    const { parent, plan } = await activePlan();
    await activePlan();

    const res = await request(server).get("/subscriptions").set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(String(plan._id));
    expect(res.body[0].amount).toBe(15000);
    expect(res.body[0].status).toBe("active");
  });

  it("cancels one, and refuses to cancel it twice", async () => {
    const { parent, plan } = await activePlan();

    const first = await request(server)
      .post("/subscriptions/cancel")
      .set(auth(parent))
      .send({ plan_id: String(plan._id) });
    expect(first.status).toBe(200);
    expect(first.body.plan.status).toBe("cancelled");

    const again = await request(server)
      .post("/subscriptions/cancel")
      .set(auth(parent))
      .send({ plan_id: String(plan._id) });
    expect(again.status).toBe(409);
  });

  it("refuses to cancel another family's plan", async () => {
    const { plan } = await activePlan();
    const stranger = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/subscriptions/cancel")
      .set(auth(stranger))
      .send({ plan_id: String(plan._id) });

    expect(res.status).toBe(403);
  });

  it("updates the existing plan when a second month is paid", async () => {
    const { parent, student, course } = await activePlan();

    const reference = await openPayment({
      parent,
      student,
      course,
      type: "subscription",
    });
    await verify(parent, { reference });

    // One plan, not two for the family to cancel separately.
    expect(await Subscription.countDocuments({})).toBe(1);
  });
});

/**
 * The three things a confirmed payment tells people (production fix).
 *
 * All three were reported from the live site after a real Flutterwave test
 * payment went through: one payment showed two different receipt numbers,
 * the receipt's "Reference" field showed a date, and every administrator
 * was told about the payment twice.
 */
describe("what a confirmed payment reports", () => {
  async function confirmedPayment() {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });
    const res = await verify(parent, { reference });
    expect(res.status).toBe(200);
    return { parent, student, course, reference, payment: res.body.payment };
  }

  /**
   * One payment, one number, and it comes from the counter.
   *
   * The receipt modal built its own from the row id —
   * `RCP-6B082C1CC0C69406F5865C64` — while the notification quoted the real
   * `RCP-202611-0002`. Both looked like receipt numbers and only one was.
   * This holds the API's end: the sequential number is on the payment, on
   * the receipt endpoint, and in the notification, and nothing else is.
   */
  it("gives one sequential receipt number, everywhere it appears", async () => {
    const { parent, payment } = await confirmedPayment();

    expect(payment.receipt_no).toMatch(/^RCP-\d{6}-\d{4}$/);

    const receipt = await request(server)
      .get(`/payments/${payment.id}/receipt`)
      .set(auth(parent));
    expect(receipt.status).toBe(200);
    expect(receipt.body.receipt_no).toBe(payment.receipt_no);
    expect(receipt.body.receipt_number).toBe(payment.receipt_no);

    const note = await Notification.findOne({
      user_id: parent._id,
      type: "payment_success",
    });
    expect(note.message).toContain(payment.receipt_no);
    // The row id must not be passed off as a receipt number anywhere.
    expect(note.message).not.toContain(String(payment.id).toUpperCase());
  });

  /** The reference is the gateway's, and is not the date. */
  it("carries the transaction reference and the date as separate fields", async () => {
    const { parent, reference, payment } = await confirmedPayment();

    const receipt = await request(server)
      .get(`/payments/${payment.id}/receipt`)
      .set(auth(parent));

    expect(receipt.body.tx_ref).toBe(reference);
    expect(receipt.body.tx_ref).toMatch(/^KIT-/);
    expect(receipt.body.created_at).toBeTruthy();
    expect(receipt.body.tx_ref).not.toBe(receipt.body.created_at);
  });

  /**
   * Exactly one notification per administrator per payment.
   *
   * The server has always sent one, from `applyConfirmation` behind the
   * atomic claim. The second came from the browser, which posted its own to
   * `/admin/notifications/send` after a successful checkout — a habit from
   * when there was no server to do it. This asserts the server's own
   * guarantee, including when verify and the webhook both land.
   */
  it("tells each administrator once, even when verify and the webhook race", async () => {
    const admin = await makeUser({ role: "admin" });
    const second = await makeUser({ role: "admin" });
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    const reference = await openPayment({ parent, student, course });

    const { handleWebhook } = await import("../src/services/payment.service.js");
    await Promise.all([
      verify(parent, { reference }),
      handleWebhook({
        event: { event: "charge.completed", data: { tx_ref: reference } },
      }),
    ]);

    for (const who of [admin, second]) {
      const notes = await Notification.find({
        user_id: who._id,
        type: "payment_success",
      });
      expect(
        notes,
        `${who.name} should hear about the payment exactly once`
      ).toHaveLength(1);
    }
  });
});
