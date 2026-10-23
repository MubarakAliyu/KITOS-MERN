/**
 * Strips MongoDB operator keys from anything a client sends (PRD §10, "Input").
 *
 * Without this, `{"email": {"$ne": null}}` posted to /login would reach a
 * Mongoose query as an operator object and match the first user in the
 * collection. `express-mongo-sanitize` is the usual answer but it mutates
 * `req.query`, which Express 5 exposes as a getter — hence this equivalent.
 *
 * Keys beginning `$` are removed; keys containing `.` are removed too, since
 * dotted paths let a write reach into a nested field the schema did not mean
 * to expose. Values are left alone: a password may legitimately contain a
 * dollar sign.
 */

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Returns a cleaned copy and the keys it dropped.
 * Depth-limited: a deeply nested payload is a cheap way to burn CPU.
 * @param {unknown} input
 * @param {number} [depth]
 * @returns {{ value: unknown, removed: string[] }}
 */
export function sanitizeValue(input, depth = 0, options = {}) {
  const { allowDots = false } = options;
  const removed = [];

  if (depth > 12) return { value: undefined, removed };

  if (Array.isArray(input)) {
    const value = input.map((item) => {
      const result = sanitizeValue(item, depth + 1, options);
      removed.push(...result.removed);
      return result.value;
    });
    return { value, removed };
  }

  if (isPlainObject(input)) {
    const value = {};
    for (const [key, raw] of Object.entries(input)) {
      if (key.startsWith("$") || (!allowDots && key.includes("."))) {
        removed.push(key);
        continue;
      }
      const result = sanitizeValue(raw, depth + 1, options);
      removed.push(...result.removed);
      value[key] = result.value;
    }
    return { value, removed };
  }

  return { value: input, removed };
}

/**
 * Routes whose body legitimately contains dotted keys.
 *
 * Permission keys are dotted by design — `users.manage`, `analytics.view` —
 * so stripping dots here would quietly empty the payload and make
 * POST /admin/permissions report success while saving nothing. These bodies
 * are still parsed by Zod, and `applyOverrides` checks every key against a
 * fixed allow-list, so a dotted key can never reach Mongo as a path.
 *
 * `$`-prefixed keys are stripped on these routes as everywhere else: there is
 * no legitimate reason for one in any request.
 */
const DOTTED_BODY_KEYS_ALLOWED = new Set([
  "/admin/permissions",
  "/platform/settings",
]);

/**
 * Cleans `body`, `params` and `query` on every request.
 *
 * `req.query` is a getter in Express 5, so it is redefined rather than
 * assigned; `req.params` is replaced per-router by Express, so route handlers
 * see the cleaned copy via this same treatment at the app level and again
 * nothing dotted survives validation.
 */
export function sanitizeKeys(req, _res, next) {
  const dropped = [];

  // `req.path` is the path within the app, without the query string.
  const bodyOptions = {
    allowDots: DOTTED_BODY_KEYS_ALLOWED.has(req.path),
  };

  if (req.body !== undefined) {
    const { value, removed } = sanitizeValue(req.body, 0, bodyOptions);
    req.body = value;
    dropped.push(...removed);
  }

  if (req.params !== undefined) {
    const { value, removed } = sanitizeValue(req.params);
    for (const key of Object.keys(req.params)) delete req.params[key];
    Object.assign(req.params, value);
    dropped.push(...removed);
  }

  const query = req.query;
  if (query !== undefined) {
    const { value, removed } = sanitizeValue(query);
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    dropped.push(...removed);
  }

  if (dropped.length > 0) {
    // Worth knowing about: legitimate clients never send these.
    req.log?.warn(
      { dropped_keys: [...new Set(dropped)] },
      "Stripped MongoDB operator keys from request"
    );
  }

  next();
}
