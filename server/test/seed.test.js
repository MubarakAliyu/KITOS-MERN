import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetState } from "./helpers.js";
import { runSeed, isRemoteDatabase } from "../src/seed/seed.js";
import { resetEnvCache } from "../src/config/env.js";
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

/**
 * The guard that stops a seed writing published passwords to a live site.
 *
 * `resolvePasswords` decides what to write from `NODE_ENV`, which is the
 * right switch for that and the wrong one for deciding whether writing is
 * safe at all. The two came apart in practice: a run against Atlas with
 * NODE_ENV unset took the development branch, ignored the DEMO_*_PASSWORD
 * values it was given, and wrote the credentials published in
 * client/src/HANDOFF.md onto a live database — with no error and a cheerful
 * summary. The destination is now checked as well as the label.
 */
describe("refusing to seed a remote database by accident", () => {
  const realUri = process.env.MONGODB_URI;
  const realNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.MONGODB_URI = realUri;
    if (realNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = realNodeEnv;
    resetEnvCache();
  });

  /** Pretend the connection string points at Atlas, without going there. */
  function pointAt(uri, nodeEnv) {
    process.env.MONGODB_URI = uri;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    resetEnvCache();
  }

  it("refuses an Atlas URI when NODE_ENV is unset", async () => {
    pointAt("mongodb+srv://user:pw@cluster0.abc.mongodb.net/?retryWrites=true", undefined);

    await expect(runSeed({ quiet: true })).rejects.toThrow(
      /refusing to seed a remote database/i
    );
  });

  it("refuses it when NODE_ENV is development", async () => {
    pointAt("mongodb+srv://user:pw@cluster0.abc.mongodb.net/", "development");

    await expect(runSeed({ quiet: true })).rejects.toThrow(
      /refusing to seed a remote database/i
    );
  });

  /**
   * The message has to name the fix. Someone meets this error once, at the
   * end of a deployment, and an error that only says "no" sends them
   * looking for the flag that turns it off.
   */
  it("names NODE_ENV=production and the passwords that were ignored", async () => {
    pointAt("mongodb+srv://user:pw@cluster0.abc.mongodb.net/", undefined);

    const error = await runSeed({ quiet: true }).catch((err) => err);

    expect(error.message).toMatch(/NODE_ENV=production/);
    expect(error.message).toMatch(/HANDOFF\.md/);
    expect(error.message).toMatch(/DEMO_ADMIN_PASSWORD/);
    expect(error.message).toMatch(/ALLOW_DEMO_SEED=true/);
  });

  it("refuses a remote host given without the +srv scheme", async () => {
    pointAt("mongodb://user:pw@cluster0.abc.mongodb.net:27017/kitos", undefined);

    await expect(runSeed({ quiet: true })).rejects.toThrow(
      /refusing to seed a remote database/i
    );
  });

  /**
   * It refuses before it clears anything. A guard that wipes the database
   * and then declines to refill it would be worse than no guard.
   */
  it("refuses before touching the data", async () => {
    await runSeed({ quiet: true });
    const before = await Payment.countDocuments({});
    expect(before).toBeGreaterThan(0);

    pointAt("mongodb+srv://user:pw@cluster0.abc.mongodb.net/", undefined);
    await runSeed({ quiet: true }).catch(() => {});

    pointAt(realUri, realNodeEnv);
    expect(await Payment.countDocuments({})).toBe(before);
  });

  it("allows the local database it is normally run against", async () => {
    // The in-memory replica set is 127.0.0.1, same as `npm run db:local`.
    expect(isRemoteDatabase(process.env.MONGODB_URI)).toBe(false);
    await expect(runSeed({ quiet: true })).resolves.toBeTruthy();
  });

  describe("reading the host out of a connection string", () => {
    it.each([
      ["mongodb://127.0.0.1:27027/?directConnection=true", false],
      ["mongodb://localhost:27017/kitos", false],
      ["mongodb://[::1]:27017", false],
      ["mongodb://localhost:27017,localhost:27018/kitos", false],
      ["mongodb+srv://user:pw@cluster0.abc.mongodb.net/", true],
      ["mongodb://user:pw@cluster0.abc.mongodb.net:27017/kitos", true],
      // One remote host among local ones still makes the whole string remote.
      ["mongodb://127.0.0.1:27017,cluster0.abc.net:27017/kitos", true],
      // Unreadable means remote: a string this cannot vouch for might be
      // production, and that is the answer to guess.
      ["not-a-uri", true],
    ])("%s -> remote: %s", (uri, expected) => {
      expect(isRemoteDatabase(uri)).toBe(expected);
    });
  });
});
