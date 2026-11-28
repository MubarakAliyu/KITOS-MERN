import crypto from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limits (PRD §10).
 *
 * Disabled under NODE_ENV=test: the suite fires hundreds of requests at these
 * routes, and a limiter would make unrelated assertions fail in a confusing
 * order. The limiter itself is tested explicitly, with a purpose-built app.
 */
const testing = () => env.NODE_ENV === "test";

/** Shared JSON body, matching the central error handler's shape. */
function limitHandler(message) {
  return (req, res) => {
    req.log?.warn(
      { ip: req.ip, path: req.originalUrl },
      "Rate limit exceeded"
    );
    res.status(429).json({ error: "Too many requests", reason: message });
  };
}

const base = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: testing,
};

/**
 * /login — 10 per 15 minutes per IP **and identifier**.
 *
 * Keying on both means one attacker cannot lock every account out from a
 * single IP, and a password-spray across many accounts from one IP still
 * trips the limit. `ipKeyGenerator` normalises IPv6 properly, which raw
 * `req.ip` does not.
 */
export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  // 10 by default; see LOGIN_RATE_LIMIT_MAX in config/env.js.
  limit: env.LOGIN_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const identifier = String(req.body?.email ?? req.body?.identifier ?? "")
      .trim()
      .toLowerCase();
    return `${ipKeyGenerator(req.ip)}:${identifier}`;
  },
  handler: limitHandler(
    "Too many sign-in attempts. Please wait 15 minutes and try again."
  ),
});

/** /forgot-password — 5 per hour per IP. */
export const forgotPasswordLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: limitHandler(
    "Too many password reset requests. Please try again later."
  ),
});

/**
 * /reset-password and /user/change-password — 10 per hour, per IP **and
 * credential**.
 *
 * This was per IP alone, which is the wrong unit for where KIT runs. A centre
 * in Sokoto or Birnin Kebbi is one shared connection: every family, every
 * instructor and every machine in the building leaves by the same address. Ten
 * password changes an hour across the whole school is a limit an ordinary
 * intake week exceeds, and the eleventh family is told to come back later with
 * an account they cannot sign in to.
 *
 * Keyed on the credential the request carries — the reset or temp token, or
 * the bearer of a signed-in session — the budget becomes ten attempts per
 * sign-in, which is the unit the limit is actually about: guessing the current
 * password of one account.
 *
 * Hashing the token rather than keying on it directly keeps a credential out
 * of the limiter's key space, which is held in memory and read by its own
 * logging. Getting a fresh token means signing in again, which needs the very
 * password an attacker would be guessing, so a new bucket is not a way around
 * this.
 *
 * The honest cost: one attacker from one address now gets ten attempts per
 * account rather than ten in total, so a spray across many accounts is no
 * longer stopped here. `loginLimiter` makes the same trade for the same
 * reason, and a spray needs a valid token per account to even reach this
 * route.
 */
export function passwordChangeKey(req) {
  const credential =
    req.body?.temp_token ?? req.body?.token ?? req.headers?.authorization;
  const scope =
    typeof credential === "string" && credential.length > 0
      ? crypto.createHash("sha256").update(credential).digest("hex").slice(0, 32)
      : "anonymous";
  return `${ipKeyGenerator(req.ip)}:${scope}`;
}

export const passwordChangeLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: passwordChangeKey,
  handler: limitHandler("Too many attempts. Please try again later."),
});

/**
 * The key for the broad ceiling: the signed-in user, or the IP if there is
 * nobody signed in.
 *
 * It was the IP alone, and a KIT centre is one shared connection. 300
 * requests a minute sounds generous until it is divided between everyone in
 * the room: a dashboard loads a dozen endpoints, so the whole centre shared
 * about twenty-five page loads a minute, and the twenty-sixth person got
 * "Please slow down" for doing nothing wrong. The end-to-end suite hits the
 * same wall from one address, which is how this was found — two writes
 * failed in the second half of a long run and passed on their own.
 *
 * Per user, the ceiling still does its job: it stops one client exhausting
 * the free-tier instance. Unauthenticated traffic keeps the IP bucket, which
 * is where a flood with no account behind it has to be caught.
 */
export function generalKey(req) {
  /**
   * The bearer token, hashed — not `req.user`.
   *
   * This limiter is mounted in `app.js` before any route, so `authenticate`
   * has not run and there is no `req.user` to read. The token is not
   * verified here either, and does not need to be: it is a bucket key, not
   * an authorization decision. A forged token buys its holder their own
   * bucket and nothing else, and anything it is sent with still fails
   * `authenticate` a moment later.
   */
  const bearer = req.headers?.authorization;
  if (typeof bearer === "string" && bearer.length > 0) {
    const hash = crypto.createHash("sha256").update(bearer).digest("hex");
    return `token:${hash.slice(0, 32)}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * A broad ceiling on everything else, so one client cannot exhaust the
 * free-tier instance. Generous enough that a dashboard loading a dozen
 * endpoints at once is nowhere near it.
 */
export const generalLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: generalKey,
  handler: limitHandler("Please slow down and try again shortly."),
});

/** Messages — 30 per minute per user (PRD §10). Used in Batch 3. */
export const messageLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => String(req.user?.id ?? ipKeyGenerator(req.ip)),
  handler: limitHandler("You are sending messages too quickly."),
});
