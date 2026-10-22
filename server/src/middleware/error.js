import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError } from "../lib/errors.js";
import { isProduction } from "../config/env.js";

/** 404 for an unmatched path. Registered after every router. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "Not found",
    reason: `No route matches ${req.method} ${req.originalUrl}`,
  });
}

/**
 * The one error handler (PRD §7.4).
 *
 * Responses are always `{ error, reason?, fields? }` — the shape the
 * frontend's axios interceptor reads. In production nothing internal escapes:
 * no stack traces, no Mongoose or driver messages. Those go to the log, where
 * they are useful and not a disclosure.
 */
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { error: "Something went wrong" };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: err.message };
    if (err.reason) body.reason = err.reason;
    if (err.fields) body.fields = err.fields;
  } else if (err instanceof ZodError) {
    // A schema parsed outside `validate` middleware (e.g. inside a service).
    status = 400;
    const fields = {};
    for (const issue of err.issues) {
      fields[issue.path.join(".") || "body"] ??= issue.message;
    }
    body = { error: "Validation failed", fields };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    const fields = {};
    for (const [path, detail] of Object.entries(err.errors)) {
      fields[path] = detail.message;
    }
    body = { error: "Validation failed", fields };
  } else if (err instanceof mongoose.Error.CastError) {
    // A malformed id that slipped past a validator.
    status = 400;
    body = {
      error: "Validation failed",
      fields: { [err.path]: "Must be a valid id" },
    };
  } else if (err?.code === 11000) {
    // Duplicate key. Name the field, but never echo the value back.
    status = 409;
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "value";
    const labels = {
      email: "That email address is already registered",
      admission_no: "That admission number is already in use",
    };
    body = {
      error: labels[field] ?? "That value is already in use",
      reason: `Duplicate ${field}`,
      fields: { [field]: labels[field] ?? "Already in use" },
    };
  } else if (err?.type === "entity.too.large") {
    status = 413;
    body = { error: "Request body too large", reason: "The JSON limit is 1 MB" };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { error: "Malformed JSON", reason: "The request body is not valid JSON" };
  }

  // 5xx is ours; 4xx is the caller's. Log accordingly so real faults stand out.
  const log = req.log ?? console;
  if (status >= 500) {
    log.error({ err, status, path: req.originalUrl }, "Unhandled request error");
  } else {
    log.warn(
      { status, path: req.originalUrl, error: body.error },
      "Request rejected"
    );
  }

  // Outside production, attach the stack to the response to save a trip to
  // the terminal while developing. Never in production (PRD §10, "Errors").
  if (!isProduction() && status >= 500) {
    body.stack = err?.stack;
  }

  res.status(status).json(body);
}
