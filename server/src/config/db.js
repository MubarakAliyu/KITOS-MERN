import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

// Fail a query rather than queue it for ever when the connection is down, so
// /health answers honestly instead of hanging.
mongoose.set("bufferCommands", false);

// Reject writes with fields the schema does not declare, instead of dropping
// them silently. A typo in a service should be loud.
mongoose.set("strictQuery", true);

/**
 * Opens the shared Mongoose connection.
 * @param {string} [uri]
 */
export async function connectDb(uri = env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  await mongoose.connect(uri, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  logger.info(
    { db: env.MONGODB_DB_NAME },
    "MongoDB connected"
  );
  return mongoose.connection;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

/** "up" once the connection is usable, "down" otherwise. Used by /health. */
export function dbStatus() {
  return mongoose.connection.readyState === 1 ? "up" : "down";
}

/**
 * True when the deployment can run multi-document transactions — Atlas and the
 * in-memory replica set can; a standalone mongod cannot. Services that must
 * stay correct either way check this before opening a session.
 */
export function supportsTransactions() {
  return Boolean(mongoose.connection.db) && mongoose.connection.readyState === 1;
}
