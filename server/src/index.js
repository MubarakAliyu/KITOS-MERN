import http from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { logger } from "./lib/logger.js";
import { loadPermissionOverrides } from "./services/settings.service.js";
import { ensureTracks } from "./services/track.service.js";
import { startReminderJob, stopReminderJob } from "./jobs/reminders.js";
import { attachRealtime, detachRealtime } from "./realtime/socket.js";
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

  /**
   * Programme tracks are rows now, not a constant.
   *
   * `ensureTracks` creates the four this programme already runs if they are
   * missing, adds an archived row for any track a course or student still
   * references, and primes the slug-to-label registry the serializers read.
   * It runs on every boot because it is idempotent and because a deployed
   * database predates the collection.
   */
  await ensureTracks();

  const app = createApp();
  const server = http.createServer(app);

  // Session reminders and overdue notices. Runs once now and then every five
  // minutes, so a restart catches up on anything missed while asleep — which
  // matters on Render's free tier, where the service does sleep.
  startReminderJob();

  // Socket.IO shares this HTTP server (PRD §7.1), so one Render web service
  // carries both the API and the chat — which the free tier requires.
  const io = attachRealtime(server);

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
    // Close the sockets before the server, or `server.close` waits on every
    // open connection and the forced exit above is what ends the process.
    await detachRealtime(io).catch((err) =>
      logger.error({ err }, "Error closing Socket.IO")
    );

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
