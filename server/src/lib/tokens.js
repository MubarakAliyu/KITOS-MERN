import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { RESET_TOKEN_TTL_MS } from "../config/constants.js";
import { unauthorized } from "./errors.js";

/**
 * JWT issue and verify.
 *
 * The legacy PHP API's defining defect was a disabled signature check, which
 * let anyone mint an admin token by editing the payload. Here verification is
 * the only way to read a token: `verifyAccessToken` always checks the HS256
 * signature and the expiry, and the algorithm is pinned so a token claiming
 * `alg: "none"` — or RS256 with an attacker-supplied key — is rejected rather
 * than trusted.
 */

const ALGORITHM = "HS256";

/**
 * Signs an access token.
 * `tv` is the user's token_version: bumping it on the user document revokes
 * every token already issued to them (password change, deactivation).
 *
 * @param {{ id: string, role: string, token_version?: number }} user
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id ?? user._id),
      role: user.role,
      tv: user.token_version ?? 0,
    },
    env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: env.JWT_EXPIRES_IN }
  );
}

/**
 * Short-lived token for the forced-reset flow. Marked `purpose: "reset"` so it
 * cannot be swapped in as an access token: `verifyAccessToken` rejects any
 * token carrying a purpose, and `verifyTempToken` requires this one.
 *
 * @param {{ id: string, role: string, token_version?: number }} user
 */
export function signTempToken(user) {
  return jwt.sign(
    {
      sub: String(user.id ?? user._id),
      role: user.role,
      tv: user.token_version ?? 0,
      purpose: "reset",
    },
    env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: "30m" }
  );
}

/**
 * Verifies an access token. Throws a 401 AppError on anything suspect.
 * @param {string} token
 */
export function verifyAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      throw unauthorized("Session expired", "Your session has expired — please sign in again");
    }
    throw unauthorized("Invalid token", "Token signature verification failed");
  }

  if (payload.purpose) {
    throw unauthorized(
      "Invalid token",
      "A password-reset token cannot be used to authenticate a request"
    );
  }

  return payload;
}

/** Verifies a forced-reset temp token. */
export function verifyTempToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      throw unauthorized("Invalid or expired token", "The reset token has expired");
    }
    throw unauthorized("Invalid or expired token", "Token signature verification failed");
  }

  if (payload.purpose !== "reset") {
    throw unauthorized(
      "Invalid or expired token",
      "This token is not a password-reset token"
    );
  }

  return payload;
}

/**
 * A password-reset token for emailing, with the hash to store.
 *
 * Only the SHA-256 hash is persisted, so a leaked database cannot be used to
 * reset anyone's password. SHA-256 rather than bcrypt is right here: the token
 * is 32 bytes of CSPRNG output, so it needs no stretching against guessing,
 * and reset verification must stay fast.
 */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    hash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * A readable one-time password for an admin-provisioned account.
 *
 * Avoids look-alike characters (O/0, l/1/I) because these get written on paper
 * and read out to a child. Always contains a letter and a digit, so it
 * satisfies the password policy it is checked against.
 */
export function generateTempPassword() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set, n) =>
    Array.from(
      { length: n },
      () => set[crypto.randomInt(0, set.length)]
    ).join("");
  return `KIT${pick(letters, 5)}${pick(digits, 3)}`;
}

/**
 * A certificate verification code (Batch 2): 10 unambiguous characters.
 */
export function generateVerificationCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 10 },
    () => alphabet[crypto.randomInt(0, alphabet.length)]
  ).join("");
}
