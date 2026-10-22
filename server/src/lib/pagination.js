import { z } from "zod";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from "../config/constants.js";

/**
 * Query shape for a paginated list endpoint (NFR1: default 20, max 100).
 * Spread into a route's query validator.
 */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_MAX_LIMIT)
    .default(PAGINATION_DEFAULT_LIMIT),
};

/** `{ page, limit }` → the `skip`/`limit` a Mongoose query wants. */
export function toSkipLimit({ page = 1, limit = PAGINATION_DEFAULT_LIMIT } = {}) {
  return { skip: (page - 1) * limit, limit };
}

/**
 * Runs a paginated find and its count together.
 *
 * Note that most Batch 1 list endpoints return a bare array, because that is
 * what the retained frontend consumes (ADR-010); they still take `page` and
 * `limit` so a large deployment is not forced to send every row. Endpoints
 * added in later batches that have no frontend contract to honour can return
 * the full envelope this produces.
 *
 * @param {import("mongoose").Model} model
 * @param {object} filter
 * @param {{ page?: number, limit?: number, sort?: object, select?: string,
 *           populate?: any }} [options]
 */
export async function paginate(model, filter = {}, options = {}) {
  const { page = 1, limit = PAGINATION_DEFAULT_LIMIT, sort = { created_at: -1 } } =
    options;
  const { skip } = toSkipLimit({ page, limit });

  let query = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (options.select) query = query.select(options.select);
  if (options.populate) query = query.populate(options.populate);

  const [items, total] = await Promise.all([
    query.exec(),
    model.countDocuments(filter),
  ]);

  return {
    items,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Escapes a user-supplied search term for safe use in a regex.
 *
 * Without this, a `q` of `.*` would scan everything and `(` would throw. The
 * anchorless case-insensitive match is deliberate: the admin user search is a
 * "contains" box.
 */
export function searchRegex(term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}
