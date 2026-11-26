import { describe, it, expect, beforeEach } from "vitest";
import { resetState } from "./helpers.js";
import { runSeed } from "../src/seed/seed.js";
import { PAYMENTS, SUBSCRIPTIONS } from "../src/seed/courses.js";
import { Payment } from "../src/models/Payment.js";
import { Subscription } from "../src/models/Subscription.js";
import { User } from "../src/models/User.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";

/**
 * The seed, run end to end against the in-memory replica set.
 *
 * It exists because the seed broke in production and nowhere else. Every
 * seeded payment took its `tx_ref` from `receiptsIssued`, which only counted
 * money that arrived — so a pending or failed fixture left the counter where
 * it was and the next paid payment reused its reference. Against the unique
 * index on `tx_ref` that is `E11000 duplicate key`.
 *
 * **Why no local run ever caught it, and what this file does about it.**
 * Mongoose builds indexes in the background after the first connection. A
 * fresh local database had not finished building the `tx_ref` index by the
 * time the seed wrote its rows, so the duplicate went in unchallenged;
 * production already had the index and rejected it. A test that simply ran
 * the seed would have passed for exactly the same reason. So
 * `beforeEach` waits for the indexes to exist before seeding — without that
 * line this file is theatre, and the bug it was written for walks straight
 * through it.
 */

beforeEach(async () => {
  await resetState();

  // The whole point. `syncIndexes` builds and waits, so the uniqueness
  // constraint is live before the first insert rather than racing it.
  await Promise.all([
    Payment.syncIndexes(),
    Subscription.syncIndexes(),
    User.syncIndexes(),
    Enrollment.syncIndexes(),
  ]);
});

describe("the demo seed", () => {
  it("completes against a database whose unique indexes already exist", async () => {
    const summary = await runSeed({ quiet: true });

    expect(summary.payments).toBe(PAYMENTS.length);
    expect(summary.subscriptions).toBe(SUBSCRIPTIONS.length);
    // Something was actually written, rather than a summary counting
    // fixtures it never inserted.
    expect(await Course.countDocuments({})).toBeGreaterThan(0);
    expect(await User.countDocuments({})).toBeGreaterThan(0);
  });

  it("inserts every payment fixture, not only the ones that fit", async () => {
    await runSeed({ quiet: true });

    expect(await Payment.countDocuments({})).toBe(PAYMENTS.length);
  });

  /** The failure itself, stated directly. */
  it("gives every seeded payment a distinct tx_ref", async () => {
    await runSeed({ quiet: true });

    const refs = (await Payment.find({}).select("tx_ref")).map((p) => p.tx_ref);

    expect(refs).toHaveLength(PAYMENTS.length);
    expect(new Set(refs).size).toBe(PAYMENTS.length);
    for (const ref of refs) expect(ref).toMatch(/^KIT-SEED-\d{4}$/);
  });

  /**
   * The precise shape of the bug: a reference numbered by receipts rather
   * than by position collides as soon as a fixture is not paid. This asserts
   * the two are no longer the same sequence, so reintroducing the old
   * expression fails here even if the fixture list later happens to end in
   * paid rows and the duplicate test passes by luck.
   */
  it("numbers references by position, independently of how many were paid", async () => {
    await runSeed({ quiet: true });

    const unpaid = await Payment.countDocuments({ status: { $ne: "paid" } });
    expect(unpaid).toBeGreaterThan(0);

    const refs = (await Payment.find({}).select("tx_ref").sort({ tx_ref: 1 }))
      .map((p) => p.tx_ref);

    expect(refs).toEqual(
      PAYMENTS.map((_, i) => `KIT-SEED-${String(i + 1).padStart(4, "0")}`)
    );
  });

  /** Receipt numbers are a separate sequence, and only paid rows get one. */
  it("issues a receipt number to paid payments and to no others", async () => {
    const summary = await runSeed({ quiet: true });

    const paid = await Payment.find({ status: "paid" }).select("receipt_no");
    const unpaid = await Payment.find({ status: { $ne: "paid" } }).select(
      "receipt_no"
    );

    expect(paid).toHaveLength(summary.receipts);
    for (const row of paid) expect(row.receipt_no).toMatch(/^RCP-\d{6}-\d{4}$/);
    for (const row of unpaid) expect(row.receipt_no).toBeNull();

    // And they are unique too — the counter they come from is atomic.
    const numbers = paid.map((p) => p.receipt_no);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  /**
   * Re-seeding is how the demo is prepared before every recording, so it has
   * to be repeatable — the second run must clear the first rather than
   * collide with it.
   */
  it("can be run twice in a row", async () => {
    await runSeed({ quiet: true });
    await runSeed({ quiet: true });

    expect(await Payment.countDocuments({})).toBe(PAYMENTS.length);
    expect(await Subscription.countDocuments({})).toBe(SUBSCRIPTIONS.length);
  });
});
