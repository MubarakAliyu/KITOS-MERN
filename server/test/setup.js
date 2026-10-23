import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach } from "vitest";

/**
 * One in-memory MongoDB for the whole suite.
 *
 * A replica set rather than a standalone mongod: KITOS uses transactions
 * (a parent adding a child writes a User, a Student and a Consent together),
 * and MongoDB only offers those on a replica set. Testing against a
 * standalone would silently skip that path and leave it unverified.
 *
 * Everything here runs at module top level, not inside `beforeAll`, and that
 * matters. `config/env.js` parses and caches `process.env` the first time any
 * property is read, which happens while the app modules are being imported —
 * before any hook runs. Setting the variables in a hook would therefore be
 * too late: the app would already have cached whatever was in the developer's
 * `server/.env`, and a token signed by a test with the harness's secret would
 * be rejected by an app verifying with the developer's. Vitest evaluates
 * setup files before the test module, so top-level await is the correct place.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-that-is-at-least-32-bytes-long";
process.env.JWT_EXPIRES_IN = "24h";
process.env.CLIENT_ORIGIN = "http://localhost:3004";
process.env.MAIL_FROM = "Kids In Tech <test@kidsintech.school>";
process.env.STORAGE_PROVIDER = "local";
process.env.LOG_LEVEL = "silent";
process.env.MONGODB_DB_NAME = "kitos_test";

// Never let a developer's SMTP settings send real mail from a test run.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});

process.env.MONGODB_URI = replSet.getUri();

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB_NAME,
});

/**
 * Wipe between tests so each one starts from a known empty database and the
 * order they run in cannot matter. Indexes are left in place — they are what
 * enforces admission-number and email uniqueness, which several tests assert.
 */
afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
