import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";

import { env, isProduction } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { logger } from "../lib/logger.js";
import { DOCS_DIR } from "../lib/paths.js";
import { User, hashPassword } from "../models/User.js";
import { Student } from "../models/Student.js";
import { Consent } from "../models/Consent.js";
import { Cohort } from "../models/Cohort.js";
import { Counter } from "../models/Counter.js";
import { Setting } from "../models/Setting.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import {
  admissionYear,
  admissionCounterKey,
  ensureSequenceAtLeast,
  formatAdmissionSequence,
} from "../lib/numbering.js";
import {
  CONSENT_CURRENT_VERSION,
  CONSENT_SCOPES,
} from "../config/constants.js";
import {
  ADMINS,
  INSTRUCTORS,
  PARENTS,
  STUDENTS,
  COHORTS,
  SETTINGS,
  DEV_PASSWORDS,
} from "./data.js";

/**
 * Rebuilds the demo world (Batch 1 Part F).
 *
 * Idempotent: it clears the Batch 1 collections first, so running it twice
 * leaves one consistent dataset rather than duplicates.
 */

/**
 * Decides which passwords to use, and refuses to touch a production database
 * with the development ones.
 *
 * Seeding production is a deliberate, guarded act (PRD §15.2): it needs
 * ALLOW_DEMO_SEED=true *and* three supplied passwords of at least 10
 * characters. Otherwise the committed demo credentials would become live
 * credentials on a public URL.
 */
function resolvePasswords() {
  if (!isProduction()) {
    return {
      admin: DEV_PASSWORDS.admin,
      staff: DEV_PASSWORDS.staff,
      family: DEV_PASSWORDS.family,
      student: DEV_PASSWORDS.student,
      source: "development defaults (client/src/HANDOFF.md)",
    };
  }

  if (!env.ALLOW_DEMO_SEED) {
    throw new Error(
      "Refusing to seed a production database.\n" +
        "Set ALLOW_DEMO_SEED=true and supply DEMO_ADMIN_PASSWORD, " +
        "DEMO_STAFF_PASSWORD and DEMO_FAMILY_PASSWORD (10+ characters each)."
    );
  }

  const supplied = {
    admin: env.DEMO_ADMIN_PASSWORD,
    staff: env.DEMO_STAFF_PASSWORD,
    family: env.DEMO_FAMILY_PASSWORD,
  };

  const missing = Object.entries(supplied)
    .filter(([, value]) => !value || value.length < 10)
    .map(([key]) => `DEMO_${key.toUpperCase()}_PASSWORD`);

  if (missing.length > 0) {
    throw new Error(
      `Refusing to seed a production database.\n` +
        `These must be set to at least 10 characters: ${missing.join(", ")}`
    );
  }

  return {
    ...supplied,
    // Children share the family password in production rather than getting a
    // fourth variable; they must change it on first sign-in anyway.
    student: supplied.family,
    source: "DEMO_*_PASSWORD environment variables",
  };
}

/** Hashes each distinct password once — bcrypt at cost 12 is deliberately slow. */
async function hashAll(passwords) {
  const entries = await Promise.all(
    ["admin", "staff", "family", "student"].map(async (key) => [
      key,
      await hashPassword(passwords[key]),
    ])
  );
  const hashes = Object.fromEntries(entries);
  hashes.forceReset = await hashPassword(DEV_PASSWORDS.forceReset);
  return hashes;
}

async function clearCollections() {
  await Promise.all([
    User.deleteMany({}),
    Student.deleteMany({}),
    Consent.deleteMany({}),
    Cohort.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
    Counter.deleteMany({}),
    Setting.deleteMany({}),
  ]);
}

export async function runSeed({ quiet = false } = {}) {
  const say = quiet ? () => {} : (msg) => console.log(msg);

  const passwords = resolvePasswords();
  const hashes = await hashAll(passwords);

  say("Clearing the Batch 1 collections…");
  await clearCollections();

  // ── Cohorts (before students, which reference them) ──────────────────────
  const cohortIds = new Map();
  const instructorIds = new Map();

  // ── Staff and parents ────────────────────────────────────────────────────
  say("Creating staff and parent accounts…");

  for (const admin of ADMINS) {
    const user = await User.create({
      role: "admin",
      name: admin.name,
      email: admin.email,
      password_hash: admin.password ? hashes.forceReset : hashes.admin,
      must_reset_password: Boolean(admin.must_reset_password),
      is_active: true,
    });
    if (admin.key === "amina") instructorIds.set("amina", user._id);
  }

  for (const instructor of INSTRUCTORS) {
    const user = await User.create({
      role: "instructor",
      name: instructor.name,
      email: instructor.email,
      bio: instructor.bio ?? null,
      password_hash: hashes.staff,
      is_active: true,
    });
    instructorIds.set(instructor.key, user._id);
  }

  const parentIds = new Map();
  for (const parent of PARENTS) {
    const user = await User.create({
      role: "parent",
      name: parent.name,
      email: parent.email,
      phone: parent.phone ?? null,
      password_hash: hashes.family,
      is_active: true,
    });
    parentIds.set(parent.key, user._id);
  }

  // ── Cohorts ──────────────────────────────────────────────────────────────
  say("Creating cohorts…");
  for (const cohort of COHORTS) {
    const doc = await Cohort.create({
      name: cohort.name,
      programme_track: cohort.programme_track,
      start_date: cohort.start_date ? new Date(cohort.start_date) : null,
      end_date: cohort.end_date ? new Date(cohort.end_date) : null,
      venue: cohort.venue,
      mode: cohort.mode,
      instructor_ids: (cohort.instructors ?? [])
        .map((key) => instructorIds.get(key))
        .filter(Boolean),
    });
    cohortIds.set(cohort.key, doc._id);
  }

  // ── Students ─────────────────────────────────────────────────────────────
  // Admission numbers are assigned in array order, so the demo world always
  // has KIT/26/001 = Liam, matching the frontend fixtures and HANDOFF.md.
  say("Creating students, with consent records…");

  const year = admissionYear();
  let sequence = 0;
  const createdStudents = [];

  for (const student of STUDENTS) {
    sequence += 1;
    const admissionNo = `KIT/${year}/${formatAdmissionSequence(sequence)}`;

    const user = await User.create({
      role: "student",
      name: student.name,
      email: student.email ?? undefined,
      admission_no: admissionNo,
      password_hash: hashes.student,
      is_active: student.is_active ?? true,
      // Seeded demo students sign in with the documented password, so they are
      // not forced to reset. The force-reset path is demonstrated by
      // amina@gmail.com and by any account an admin or parent creates.
      must_reset_password: false,
    });

    const profile = await Student.create({
      user_id: user._id,
      parent_id: parentIds.get(student.parent),
      name: student.name,
      age: student.age,
      programme_track: student.programme_track,
      cohort_ids: student.cohort ? [cohortIds.get(student.cohort)] : [],
      status: student.consent ? "active" : "pending",
    });

    if (student.consent) {
      const consent = await Consent.create({
        parent_id: parentIds.get(student.parent),
        student_id: profile._id,
        version: CONSENT_CURRENT_VERSION,
        scopes: [...CONSENT_SCOPES],
        accepted_at: new Date(),
        ip: "127.0.0.1",
        user_agent: "KITOS seed",
      });
      profile.consent_id = consent._id;
      await profile.save();
    }

    createdStudents.push({ admissionNo, ...student });
  }

  // Move the counter past the hand-written numbers, so the first
  // admin-created student gets the next free slot instead of colliding.
  await ensureSequenceAtLeast(admissionCounterKey(year), sequence);

  // ── Settings ─────────────────────────────────────────────────────────────
  say("Writing platform settings…");
  await Setting.create({ key: "platform", ...SETTINGS, permissions: [] });

  // ── Audit ────────────────────────────────────────────────────────────────
  await ActivityLog.create({
    actor_role: "system",
    actor_name: "Seed",
    action: "seeded_database",
    description:
      `Seeded ${ADMINS.length} admin, ${INSTRUCTORS.length} instructor, ` +
      `${PARENTS.length} parent and ${STUDENTS.length} student accounts`,
    target_type: "database",
    meta: { source: passwords.source },
  });

  const summary = {
    admins: ADMINS.length,
    instructors: INSTRUCTORS.length,
    parents: PARENTS.length,
    students: STUDENTS.length,
    cohorts: COHORTS.length,
    firstAdmission: createdStudents[0]?.admissionNo,
    lastAdmission: createdStudents.at(-1)?.admissionNo,
    passwordSource: passwords.source,
  };

  // In production the credentials just set are written to a git-ignored file
  // rather than printed, so they are not left in a terminal scrollback or a
  // CI log.
  if (isProduction()) {
    const file = path.join(DOCS_DIR, "DEMO-ACCOUNTS.md");
    await writeFile(
      file,
      [
        "# Demo accounts",
        "",
        "> Generated by `npm run seed`. **Git-ignored — never commit this file.**",
        `> Written ${new Date().toISOString()}.`,
        "",
        "| Role | Sign in with | Password |",
        "|---|---|---|",
        `| Admin | admin@kidsintech.school | \`${passwords.admin}\` |`,
        `| Instructor | instructor@kidsintech.school | \`${passwords.staff}\` |`,
        `| Instructor | ahmed@kidsintech.school | \`${passwords.staff}\` |`,
        `| Parent | parent@kidsintech.school | \`${passwords.family}\` |`,
        `| Student | ${createdStudents[0]?.admissionNo} | \`${passwords.student}\` |`,
        `| Force-reset demo | amina@gmail.com | \`${DEV_PASSWORDS.forceReset}\` |`,
        "",
        "Change these after the demo, and rotate the Atlas password too.",
        "",
      ].join("\n"),
      "utf8"
    );
    say(`\nCredentials written to ${file} (git-ignored).`);
  }

  return summary;
}

/** CLI entry point. Not run when the seeder is imported by a test. */
async function main() {
  await connectDb();
  try {
    const summary = await runSeed();

    console.log("\nSeed complete.\n");
    console.log(`  Admins:      ${summary.admins}`);
    console.log(`  Instructors: ${summary.instructors}`);
    console.log(`  Parents:     ${summary.parents}`);
    console.log(`  Students:    ${summary.students} (${summary.firstAdmission} … ${summary.lastAdmission})`);
    console.log(`  Cohorts:     ${summary.cohorts}`);
    console.log(`  Passwords:   ${summary.passwordSource}`);

    if (!isProduction()) {
      console.log("\n  Sign in with:\n");
      console.log(`    Admin        admin@kidsintech.school        ${DEV_PASSWORDS.admin}`);
      console.log(`    Instructor   instructor@kidsintech.school   ${DEV_PASSWORDS.staff}`);
      console.log(`    Parent       parent@kidsintech.school       ${DEV_PASSWORDS.family}`);
      console.log(`    Student      ${summary.firstAdmission}                    ${DEV_PASSWORDS.student}`);
      console.log(`    Force reset  amina@gmail.com                ${DEV_PASSWORDS.forceReset}`);
    }
    console.log("");
  } finally {
    await disconnectDb();
  }
}

// Run only when invoked directly (`npm run seed`), not on import.
// `pathToFileURL` rather than string surgery: on Windows a path is
// `C:\…\seed.js` and the URL is `file:///C:/…/seed.js`, which no amount of
// slash-swapping lines up reliably.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    logger.error({ err }, "Seed failed");
    console.error(`\n${err.message}\n`);
    mongoose.disconnect().finally(() => process.exit(1));
  });
}
