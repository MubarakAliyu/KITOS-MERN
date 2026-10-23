import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User, hashPassword } from "../src/models/User.js";
import { Student } from "../src/models/Student.js";
import { Consent } from "../src/models/Consent.js";
import { Setting } from "../src/models/Setting.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetPermissions } from "../src/config/permissions.js";
import {
  CONSENT_CURRENT_VERSION,
  CONSENT_SCOPES,
} from "../src/config/constants.js";

/**
 * Shared fixtures and request helpers.
 *
 * Passwords are hashed once per process rather than per user: bcrypt at cost
 * 12 takes roughly a quarter of a second, and a suite that creates a dozen
 * users per file would otherwise spend most of its time hashing.
 */

export const PASSWORD = "TestPass123";
let cachedHash;

export async function passwordHash() {
  cachedHash ??= await hashPassword(PASSWORD);
  return cachedHash;
}

/** A fresh app instance. No listening socket; supertest drives it directly. */
export function app() {
  return createApp();
}

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

/**
 * Creates a user of any role.
 * @param {object} [overrides]
 */
export async function makeUser(overrides = {}) {
  const role = overrides.role ?? "admin";
  const base = {
    role,
    name: overrides.name ?? `Test ${role}`,
    password_hash: await passwordHash(),
    is_active: true,
    ...overrides,
  };

  if (role === "student") {
    base.admission_no ??= `KIT/26/${String(900 + (counter += 1)).slice(-3)}`;
    // Students need no email (child-safety rule), so only set one if asked.
  } else {
    base.email ??= `${role}-${unique()}@kidsintech.test`;
  }

  return User.create(base);
}

/**
 * A parent with a child: the User, the Student profile and the Consent row,
 * exactly as POST /students produces them.
 *
 * `consented: false` leaves the student `pending`, which is the state that
 * must be refused at sign-in.
 */
export async function makeFamily({ consented = true, childOverrides = {} } = {}) {
  const parent = await makeUser({ role: "parent", name: "Test Parent" });

  const childUser = await makeUser({
    role: "student",
    name: childOverrides.name ?? "Test Child",
    ...childOverrides,
  });

  const student = await Student.create({
    user_id: childUser._id,
    parent_id: parent._id,
    name: childUser.name,
    age: childOverrides.age ?? 11,
    programme_track: childOverrides.programme_track ?? "scratch",
    status: consented ? "active" : "pending",
  });

  let consent = null;
  if (consented) {
    consent = await Consent.create({
      parent_id: parent._id,
      student_id: student._id,
      version: CONSENT_CURRENT_VERSION,
      scopes: [...CONSENT_SCOPES],
      accepted_at: new Date(),
    });
    student.consent_id = consent._id;
    await student.save();
  }

  return { parent, childUser, student, consent };
}

/** A signed access token for a user document. */
export function tokenFor(user) {
  return signAccessToken({
    id: user._id,
    role: user.role,
    token_version: user.token_version ?? 0,
  });
}

/** `Authorization` header for a user. */
export function auth(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

/** Signs in over HTTP and returns the parsed body. */
export async function login(server, identifier, password = PASSWORD) {
  return request(server)
    .post("/login")
    .send({ email: identifier, password });
}

/** A fresh ObjectId string, for "not found" assertions. */
export const missingId = () => new mongoose.Types.ObjectId().toString();

/**
 * Resets process-wide state that would otherwise leak between tests: the
 * permission matrix is a module-level singleton, and the settings singleton
 * is recreated per test by the afterEach wipe.
 */
export async function resetState() {
  resetPermissions();
  await Setting.deleteMany({});
}
