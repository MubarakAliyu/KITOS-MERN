import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured JSON logs (NFR7). Secrets and credentials are redacted at the
 * logger rather than at each call site, so a future `logger.info({ body })`
 * cannot leak a password by accident.
 */
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "new_password",
      "current_password",
      "password_hash",
      "token",
      "temp_token",
      "access",
      "*.password",
      "*.new_password",
      "*.current_password",
      "*.password_hash",
    ],
    censor: "[redacted]",
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
