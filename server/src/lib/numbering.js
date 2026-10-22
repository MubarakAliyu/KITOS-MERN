import { Counter } from "../models/Counter.js";
import { DISPLAY_TIME_ZONE } from "../config/constants.js";

/**
 * Atomic sequence numbers.
 *
 * Every human-facing serial in KITOS (admission numbers now; receipt and
 * certificate serials in Batches 2 and 3) comes from one `findOneAndUpdate`
 * with `$inc` and `upsert`. That is a single atomic document update, so two
 * simultaneous requests cannot be handed the same number — which a
 * read-then-write counter would do under any real concurrency.
 */

/**
 * The next value of a counter. Creates it at 1 on first use.
 * @param {string} key e.g. "admission:26"
 * @param {{ session?: import("mongoose").ClientSession }} [options]
 * @returns {Promise<number>}
 */
export async function nextSequence(key, options = {}) {
  const run = () =>
    Counter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        ...(options.session ? { session: options.session } : {}),
      }
    ).lean();

  try {
    const doc = await run();
    return doc.seq;
  } catch (err) {
    // Two upserts racing to create the same counter: one wins, the other gets
    // a duplicate-key error. The document now exists, so a straight retry
    // takes the normal $inc path.
    if (err?.code === 11000) {
      const doc = await run();
      return doc.seq;
    }
    throw err;
  }
}

/** Reads a counter without advancing it. Used for previews. */
export async function peekSequence(key) {
  const doc = await Counter.findById(key).lean();
  return doc?.seq ?? 0;
}

/**
 * Two-digit year in Africa/Lagos. Admission numbers are issued against the
 * local academic year, so a student enrolling at 00:30 Lagos time on 1 January
 * must not get the previous year's prefix because the server runs in UTC.
 * @param {Date} [now]
 */
export function admissionYear(now = new Date()) {
  const year = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
  }).format(now);
  return year.slice(-2);
}

/** Pads to three digits, widening to four and beyond past 999. */
export function formatAdmissionSequence(seq) {
  return String(seq).padStart(3, "0");
}

export const admissionCounterKey = (year) => `admission:${year}`;

/**
 * Issues the next admission number, e.g. `KIT/26/001`.
 * @param {{ now?: Date, session?: import("mongoose").ClientSession }} [options]
 * @returns {Promise<string>}
 */
export async function nextAdmissionNumber(options = {}) {
  const year = admissionYear(options.now);
  const seq = await nextSequence(admissionCounterKey(year), options);
  return `KIT/${year}/${formatAdmissionSequence(seq)}`;
}

/**
 * What `nextAdmissionNumber` would return, without reserving it.
 * Backs `GET /admin/next-admission-no`, which the Add User modal shows before
 * the form is submitted — so it must not consume a number.
 * @param {{ now?: Date }} [options]
 */
export async function peekAdmissionNumber(options = {}) {
  const year = admissionYear(options.now);
  const seq = (await peekSequence(admissionCounterKey(year))) + 1;
  return `KIT/${year}/${formatAdmissionSequence(seq)}`;
}

/**
 * Moves a counter forward so it never re-issues a number already in use.
 * The seed calls this after inserting students with hand-written admission
 * numbers; without it the first admin-created student would collide.
 * @param {string} key
 * @param {number} value
 */
export async function ensureSequenceAtLeast(key, value) {
  await Counter.updateOne(
    { _id: key, seq: { $lt: value } },
    { $set: { seq: value } },
    { upsert: true }
  );
}

/** Receipt serials, RCP-YYYYMM-NNNN (Batch 3). */
export async function nextReceiptNumber(options = {}) {
  const now = options.now ?? new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const period = `${year}${month}`;
  const seq = await nextSequence(`receipt:${period}`, options);
  return `RCP-${period}-${String(seq).padStart(4, "0")}`;
}

/** Certificate serials, KIT-CERT-YYYY-NNNN (Batch 2). */
export async function nextCertificateSerial(options = {}) {
  const now = options.now ?? new Date();
  const year = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
  }).format(now);
  const seq = await nextSequence(`cert:${year}`, options);
  return `KIT-CERT-${year}-${String(seq).padStart(4, "0")}`;
}
