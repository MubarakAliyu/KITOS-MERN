import { z } from "zod";
import { badRequest } from "../lib/errors.js";

/**
 * Zod validation for body, params and query (PRD §10, "Input").
 *
 * The parsed result replaces the raw input, so a handler downstream can only
 * see fields the schema declared — unknown keys are dropped rather than passed
 * through to a model. Failures come back as
 * `{ error: "Validation failed", fields: { name: "message" } }`, the shape the
 * frontend's forms render.
 *
 * @param {{ body?: z.ZodTypeAny, params?: z.ZodTypeAny, query?: z.ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, _res, next) {
    const fields = {};

    for (const source of ["body", "params", "query"]) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});

      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.join(".") || source;
          // First message per field: forms show one line, and the first is
          // the most specific.
          fields[key] ??= issue.message;
        }
        continue;
      }

      // `req.query` is a getter in Express 5 and cannot be assigned.
      if (source === "query") {
        Object.defineProperty(req, "query", {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        req[source] = result.data;
      }
    }

    if (Object.keys(fields).length > 0) {
      next(badRequest("Validation failed", undefined, fields));
      return;
    }

    next();
  };
}

/** A MongoDB ObjectId, as a 24-character hex string. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

/** `{ id }` for a route like `/students/:id`. */
export const idParamSchema = z.object({ id: objectIdSchema });
