import http from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { logger } from "./lib/logger.js";
import { loadPermissionOverrides } from "./services/settings.service.js";
import { startReminderJob, stopReminderJob } from "./jobs/reminders.js";
import "./models/index.js";

/**
 * Process entry point: connect the database, load settings, listen, and shut
 * down cleanly. `app.js` stays free of side effects so tests can import it.
 */
async function main() {
  await connectDb();

  // Permission overrides live in the settings singleton and must be in force
  // before the first request is served, not after it.
  await loadPermissionOverrides();

  const app = createApp();
  const server = http.createServer(app);

  // Session reminders and overdue notices. Runs once now and then every five
  // minutes, so a restart catches up on anything missed while asleep — which
  // matters on Render's free tier, where the service does sleep.
  startReminderJob();

  // Socket.IO attaches to this same server in Batch 3 (PRD §7.1).

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, client_origin: env.CLIENT_ORIGIN },
      "KITOS API listening"
    );
  });

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests
   * finish, then close the database. Render sends SIGTERM on every deploy, and
   * without this a request in progress is cut off mid-transaction.
   */
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");

    // Don't wait for ever on a hung connection.
    const force = setTimeout(() => {
      logger.error("Shutdown timed out — exiting");
      process.exit(1);
    }, 10000);
    force.unref();

    stopReminderJob();

    server.close(async (err) => {
      if (err) logger.error({ err }, "Error closing HTTP server");
      try {
        await disconnectDb();
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Error closing MongoDB connection");
      }
      clearTimeout(force);
      process.exit(err ? 1 : 0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // An unhandled rejection leaves the process in an unknown state; log it and
  // let the platform restart us rather than serving from a broken one.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  // Most often a bad or missing environment variable, which env.js reports by
  // name. Nothing is listening yet, so exit rather than limp on.
  logger.fatal({ err }, "Failed to start the KITOS API");
  console.error(err.message);
  process.exit(1);
});
