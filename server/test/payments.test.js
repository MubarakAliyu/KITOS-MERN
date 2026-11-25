import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Payment } from "../src/models/Payment.js";
import { Subscription } from "../src/models/Subscription.js";
import { Notification } from "../src/models/Notification.js";
import { ActivityLog } from "../src/models/ActivityLog.js";
import { Counter } from "../src/models/Counter.js";
import { resetEnvCache } from "../src/config/env.js";
import { verifyWebhookSignature } from "../src/lib/paystack.js";

let server;

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
  request(server).post("/paystack/initiate").set(auth(parent)).send(body);

const verify = (parent, body) =>
  request(server).post("/paystack/verify").set(auth(parent)).send(body);

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

    const payment = await Payment.findOne({ paystack_ref: res.body.reference });
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
    const payment = await Payment.findOne({ paystack_ref: res.body.reference });
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
    // Paystack settled.
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

    const [viaVerify, viaWebhook] = await Promise.all([
      verify(parent, { reference }),
      handleWebhook({
        event: {
          event: "charge.success",
          data: { reference, status: "success", amount: FEE_KOBO },
        },
      }),
    ]);

    expect(viaVerify.status).toBe(200);
    expect(viaWebhook.received).toBe(true);

    const payments = await Payment.find({ paystack_ref: reference });
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
   * their own Paystack account and present that reference.
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

    const payment = await Payment.findOne({ paystack_ref: reference });
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

    const payment = await Payment.findOne({ paystack_ref: reference });
    expect(payment.status).toBe("failed");
    expect(await Enrollment.countDocuments({})).toBe(0);
  });
});

// ── The webhook ─────────────────────────────────────────────────────────────

describe("the Paystack webhook", () => {
  const SECRET = "sk_test_webhook_secret_for_tests";

  /** Live mode: the signature can only be checked when a key is configured. */
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    resetEnvCache();
    server = app();
  });

  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    resetEnvCache();
  });

  const sign = (body) =>
    crypto.createHmac("sha512", SECRET).update(body).digest("hex");

  const post = (body, signature) =>
    request(server)
      .post("/paystack/webhook")
      .set("Content-Type", "application/json")
      .set(signature ? { "x-paystack-signature": signature } : {})
      .send(body);

  async function paidPaymentRef() {
    const { parent, student } = await makeFamily();
    const course = await makeCourse();
    // Initiate would call Paystack for real in live mode, so the row is
    // written directly — this test is about the signature, not the gateway.
    const payment = await Payment.create({
      paystack_ref: "KIT-WEBHOOK-TEST-0001",
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
    return { reference: payment.paystack_ref, student, course };
  }

  it("confirms a correctly signed charge.success", async () => {
    const { reference, student, course } = await paidPaymentRef();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference, status: "success", amount: FEE_KOBO, channel: "card" },
    });

    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);

    const payment = await Payment.findOne({ paystack_ref: reference });
    expect(payment.status).toBe("paid");
    expect(payment.confirmed_via).toBe("webhook");
    expect(
      await Enrollment.countDocuments({
        student_id: student._id,
        course_id: course._id,
        status: "active",
      })
    ).toBe(1);
  });

  it("ignores a wrong signature, and answers 200 so Paystack stops retrying", async () => {
    const { reference } = await paidPaymentRef();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference, status: "success", amount: FEE_KOBO },
    });

    const res = await post(body, sign(body + "tampered"));

    // 200 deliberately: a forged signature will never become valid, and a
    // 4xx would earn hours of retries.
    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ paystack_ref: reference })).status).toBe(
      "pending"
    );
  });

  it("ignores a missing signature", async () => {
    const { reference } = await paidPaymentRef();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference, status: "success", amount: FEE_KOBO },
    });

    const res = await post(body, null);

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ paystack_ref: reference })).status).toBe(
      "pending"
    );
  });

  /**
   * A signature is over the exact bytes. Changing a value but keeping the
   * body the same length is the case a naive length-only check would pass.
   */
  it("ignores a body altered after signing", async () => {
    const { reference } = await paidPaymentRef();
    const signed = JSON.stringify({
      event: "charge.success",
      data: { reference, status: "success", amount: 100 },
    });
    const tampered = signed.replace('"amount":100', '"amount":999');

    const res = await post(tampered, sign(signed));

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
  });

  it("is a no-op when replayed, however many times", async () => {
    const { reference } = await paidPaymentRef();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference, status: "success", amount: FEE_KOBO },
    });
    const signature = sign(body);

    const first = await post(body, signature);
    const second = await post(body, signature);
    const third = await post(body, signature);

    expect(first.body.already_confirmed).toBe(false);
    expect(second.body.already_confirmed).toBe(true);
    expect(third.body.already_confirmed).toBe(true);

    expect(await Enrollment.countDocuments({})).toBe(1);
    expect(await ActivityLog.countDocuments({ action: "payment_confirmed" })).toBe(1);
  });

  it("ignores an event type it does not act on", async () => {
    const { reference } = await paidPaymentRef();
    const body = JSON.stringify({
      event: "charge.failed",
      data: { reference, status: "failed" },
    });

    const res = await post(body, sign(body));

    expect(res.body.handled).toBe(false);
    expect((await Payment.findOne({ paystack_ref: reference })).status).toBe(
      "pending"
    );
  });

  it("ignores a reference it never issued", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "KIT-SOMEONE-ELSES-REF", status: "success", amount: 1 },
    });

    const res = await post(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(
      verifyWebhookSignature({ rawBody: Buffer.from("{}"), signature: "short" })
    ).toBe(false);
  });
});

describe("the webhook in simulated mode", () => {
  /**
   * With no secret key there is no way to verify a signature, so the endpoint
   * must not act. Appearing to work where it provably cannot is worse than
   * saying so.
   */
  it("refuses to act, and says why", async () => {
    const res = await request(server)
      .post("/paystack/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "charge.success", data: { reference: "x" } }));

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
    const pending = await Payment.findOne({ paystack_ref: reference });

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
