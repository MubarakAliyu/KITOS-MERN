/**
 * An error with an HTTP status, thrown by services and rendered by the error
 * middleware. The frontend's axios interceptor reads `error` and `reason`
 * (client/src/_lib/api/client.js), so those are the two fields that matter.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status code.
   * @param {string} message Goes out as `error` — safe for a user to read.
   * @param {string} [reason] Extra detail, also sent to the client.
   * @param {Record<string, string>} [fields] Per-field messages, as Zod produces.
   */
  constructor(status, message, reason, fields) {
    super(message);
    this.name = "AppError";
    this.status = status;
    if (reason) this.reason = reason;
    if (fields) this.fields = fields;
    // Marks errors we raised deliberately, so the handler can tell them from
    // a genuine crash and log them at the right level.
    this.expected = true;
  }
}

export const badRequest = (message = "Bad request", reason, fields) =>
  new AppError(400, message, reason, fields);

export const unauthorized = (message = "Unauthorized", reason) =>
  new AppError(401, message, reason);

export const forbidden = (message = "Forbidden", reason) =>
  new AppError(403, message, reason);

export const notFound = (message = "Not found", reason) =>
  new AppError(404, message, reason);

export const conflict = (message = "Conflict", reason) =>
  new AppError(409, message, reason);

export const unprocessable = (message = "Unprocessable entity", reason, fields) =>
  new AppError(422, message, reason, fields);

export const tooManyRequests = (message = "Too many requests", reason) =>
  new AppError(429, message, reason);
