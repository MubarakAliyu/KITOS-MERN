import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import crypto from "node:crypto";

import { env, isProduction } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { sanitizeKeys } from "./middleware/sanitizeKeys.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { router } from "./routes/index.js";

/**
 * The allowed browser origins.
 *
 * Production allows exactly CLIENT_ORIGIN (PRD §10). Development also allows
 * the local Next.js dev server, because CLIENT_ORIGIN is usually pointed at a
 * deployed frontend while working locally.
 */
function allowedOrigins() {
  const origins = new Set([env.CLIENT_ORIGIN]);
  if (!isProduction()) {
    origins.add("http://localhost:3004");
    origins.add("http://127.0.0.1:3004");
  }
  return [...origins];
}

/**
 * Builds the Express app.
 *
 * A factory rather than a module-level singleton so the test suite can create
 * an app per file against its own in-memory database, with no shared state and
 * no listening socket.
 */
export function createApp() {
  const app = express();

  // Render terminates TLS at its proxy, so req.ip and req.protocol are only
  // correct once the proxy is trusted. Rate limiting keys on req.ip, so this
  // matters for more than logging.
  app.set("trust proxy", 1);

  // Do not advertise the framework.
  app.disable("x-powered-by");

  app.use(
    helmet({
      // The API serves JSON, not pages, so a restrictive CSP here would only
      // affect error documents; cross-origin reads are governed by CORS.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const origins = allowedOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: a server-to-server call, curl, or a health probe.
        // Those are not subject to the browser's same-origin rules, so there
        // is nothing for CORS to protect against.
        if (!origin) {
          callback(null, true);
          return;
        }
        callback(null, origins.includes(origin));
      },
      // The API is stateless and sets no cookies (ADR-004); the token travels
      // in the Authorization header.
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use(
    pinoHttp({
      logger,
      // A request id on every log line, and echoed back so a user can quote it
      // in a bug report.
      genReqId(req, res) {
        const existing = req.headers["x-request-id"];
        const id = typeof existing === "string" && existing ? existing : crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      // /health is polled constantly by Render; logging each one is noise.
      autoLogging: {
        ignore: (req) => req.url === "/health",
      },
    })
  );

  // Must run before any validator or query: strips `$`- and `.`-prefixed keys
  // so an operator object cannot reach Mongoose.
  app.use(sanitizeKeys);

  app.use(generalLimiter);

  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
