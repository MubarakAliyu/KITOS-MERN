import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import { ActivityLog } from "../models/ActivityLog.js";
import {
  signAccessToken,
  signTempToken,
  verifyTempToken,
  createResetToken,
  hashResetToken,
} from "../lib/tokens.js";
import { unauthorized, forbidden, badRequest } from "../lib/errors.js";
import { logActivity } from "../lib/audit.js";
import { sendMail, passwordResetEmail } from "../lib/mailer.js";
import {
  ADMISSION_NO_PATTERN,
  LOGIN_FAILURE_AUDIT_THRESHOLD,
  LOGIN_FAILURE_AUDIT_WINDOW_MS,
} from "../config/constants.js";

/**
 * Authentication (FR1–FR4). All business rules for sign-in live here; the
 * controller only unpacks the request and shapes the response.
 */

/**
 * Is this identifier an admission number rather than an email address?
 * Students sign in with `KIT/YY/NNN`, everyone else with email, and the
 * frontend sends both through the same `email` field.
 */
export function isAdmissionNumber(identifier) {
  return ADMISSION_NO_PATTERN.test(String(identifier ?? "").trim());
}

/**
 * Finds the user behind a sign-in identifier.
 * Loads `password_hash` and `token_version`, which are `select: false`.
 */
async function findByIdentifier(identifier) {
  const raw = String(identifier ?? "").trim();

  if (isAdmissionNumber(raw)) {
    return User.findOne({ admission_no: raw.toUpperCase() }).select(
      "+password_hash +token_version"
    );
  }

  return User.findOne({ email: raw.toLowerCase() })
    .collation({ locale: "en", strength: 2 })
    .select("+password_hash +token_version");
}

/**
 * Records a failed sign-in and, once a burst crosses the threshold, writes an
 * audit row (PRD §10: "login failure bursts").
 *
 * Every attempt is logged at `login_failed`; the audit row is the summary that
 * the admin activity log surfaces, so a single fat-fingered password does not
 * raise an alarm but a spray against one account does.
 */
async function recordFailure({ identifier, ip, userId, userRole }) {
  await logActivity({
    actor: userId ? { id: userId, role: userRole, name: identifier } : null,
    action: "login_failed",
    description: `Failed sign-in attempt for ${identifier}`,
    target_type: "user",
    target_id: userId ? String(userId) : null,
    meta: { identifier },
    ip,
  });

  const since = new Date(Date.now() - LOGIN_FAILURE_AUDIT_WINDOW_MS);
  const recent = await ActivityLog.countDocuments({
    action: "login_failed",
    "meta.identifier": identifier,
    created_at: { $gte: since },
  });

  if (recent >= LOGIN_FAILURE_AUDIT_THRESHOLD) {
    await logActivity({
      actor: null,
      action: "login_failure_burst",
      description: `${recent} failed sign-in attempts for ${identifier} in 15 minutes`,
      target_type: "user",
      target_id: userId ? String(userId) : null,
      meta: { identifier, attempts: recent },
      ip,
    });
  }
}

/**
 * Signs a user in.
 *
 * Returns either `{ access, token, user }` or, for an account that must choose
 * a new password first, `{ must_reset_password: true, temp_token, user }` —
 * the two shapes `client/src/_lib/auth/auth-options.js` branches on.
 *
 * `access` is the field the frontend reads; `token` carries the same value
 * because the mock handlers used that name (ADR-011).
 *
 * @param {{ identifier: string, password: string, ip?: string }} input
 */
export async function login({ identifier, password, ip }) {
  const user = await findByIdentifier(identifier);

  // Same error whether the account is missing or the password is wrong, so
  // the response cannot be used to enumerate accounts.
  const invalid = () =>
    unauthorized(
      isAdmissionNumber(identifier)
        ? "Invalid admission number or password"
        : "Invalid credentials"
    );

  if (!user) {
    await recordFailure({ identifier, ip });
    throw invalid();
  }

  const passwordOk = await user.verifyPassword(password);
  if (!passwordOk) {
    await recordFailure({
      identifier,
      ip,
      userId: user._id,
      userRole: user.role,
    });
    throw invalid();
  }

  if (!user.is_active) {
    await logActivity({
      actor: { id: user._id, role: user.role, name: user.name },
      action: "login_blocked_inactive",
      description: `Deactivated account attempted to sign in: ${identifier}`,
      target_type: "user",
      target_id: String(user._id),
      ip,
    });
    throw unauthorized(
      "Account deactivated",
      "This account has been deactivated — contact an administrator"
    );
  }

  // A child's account exists from the moment the parent adds them, but cannot
  // be used until consent is on record (PRD §10, "Consent").
  if (user.role === "student") {
    const student = await Student.findOne({ user_id: user._id }).select(
      "status"
    );
    if (student && student.status === "pending") {
      await logActivity({
        actor: { id: user._id, role: user.role, name: user.name },
        action: "login_blocked_pending_consent",
        description: `Student ${identifier} attempted to sign in before parental consent was recorded`,
        target_type: "user",
        target_id: String(user._id),
        ip,
      });
      throw forbidden("Account pending parental consent");
    }
  }

  user.last_login_at = new Date();
  await user.save();

  if (user.must_reset_password) {
    // No access token until a new password is chosen: the temp token is only
    // good for the reset endpoint.
    return {
      must_reset_password: true,
      temp_token: signTempToken(user),
      user: user.toAuthJSON(),
    };
  }

  const access = signAccessToken(user);

  await logActivity({
    actor: { id: user._id, role: user.role, name: user.name },
    action: "login",
    description: `${user.name} signed in`,
    target_type: "user",
    target_id: String(user._id),
    ip,
  });

  return {
    access,
    // Same value under the name the mock handlers used (ADR-011).
    token: access,
    user: user.toAuthJSON(),
  };
}

/**
 * Starts a password reset.
 *
 * Always resolves, whether or not the address is registered (PRD §9.1: "no
 * user enumeration"). Only the token's hash is stored.
 */
export async function requestPasswordReset({ email, ip }) {
  const user = await User.findOne({ email: String(email).toLowerCase() })
    .collation({ locale: "en", strength: 2 })
    .select("+reset_token_hash +reset_token_expires_at");

  if (!user || !user.is_active) {
    // Deliberately silent.
    return { ok: true };
  }

  const { token, hash, expiresAt } = createResetToken();
  user.reset_token_hash = hash;
  user.reset_token_expires_at = expiresAt;
  await user.save();

  const message = passwordResetEmail({ name: user.name, token });
  await sendMail({ to: user.email, ...message });

  await logActivity({
    actor: { id: user._id, role: user.role, name: user.name },
    action: "password_reset_requested",
    description: `Password reset requested for ${user.email}`,
    target_type: "user",
    target_id: String(user._id),
    ip,
  });

  return { ok: true };
}

/**
 * Completes a reset, from either path:
 *   - an emailed `token`, matched against its stored SHA-256 hash and expiry;
 *   - a `temp_token` from the forced first-login flow.
 *
 * Either way `must_reset_password` is cleared and `token_version` incremented,
 * so any session opened before the change is dead.
 *
 * @param {{ token?: string, temp_token?: string, password: string, ip?: string }} input
 */
export async function resetPassword({ token, temp_token, password, ip }) {
  let user;

  if (temp_token) {
    const payload = verifyTempToken(temp_token);
    user = await User.findById(payload.sub).select(
      "+password_hash +token_version"
    );
    if (!user) throw badRequest("Invalid or expired token");

    // A temp token issued before an earlier password change must not work
    // twice.
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      throw badRequest("Invalid or expired token", "This reset link has already been used");
    }
  } else if (token) {
    user = await User.findOne({
      reset_token_hash: hashResetToken(token),
      reset_token_expires_at: { $gt: new Date() },
    }).select("+password_hash +token_version +reset_token_hash +reset_token_expires_at");

    if (!user) throw badRequest("Invalid or expired token");
  } else {
    throw badRequest("Invalid or expired token", "No reset token was provided");
  }

  await user.setPassword(password);
  user.must_reset_password = false;
  user.reset_token_hash = null;
  user.reset_token_expires_at = null;
  user.revokeTokens();
  await user.save();

  await logActivity({
    actor: { id: user._id, role: user.role, name: user.name },
    action: "password_reset",
    description: `${user.name} set a new password`,
    target_type: "user",
    target_id: String(user._id),
    ip,
  });

  return { ok: true, success: true };
}

/**
 * Changes a password for a signed-in user, or finishes a forced reset when the
 * request carries a `temp_token` instead of the current password — the
 * frontend's force-reset screen posts here (`client/src/_lib/api/settings.js`).
 *
 * @param {{ user?: import("mongoose").Document, current_password?: string,
 *           new_password: string, temp_token?: string, ip?: string }} input
 */
export async function changePassword({
  user: sessionUser,
  current_password,
  new_password,
  temp_token,
  ip,
}) {
  if (temp_token) {
    return resetPassword({ temp_token, password: new_password, ip });
  }

  if (!sessionUser) {
    throw unauthorized("Authentication required");
  }

  const user = await User.findById(sessionUser._id ?? sessionUser.id).select(
    "+password_hash +token_version"
  );
  if (!user) throw unauthorized("Authentication required");

  if (!current_password) {
    throw badRequest("Validation failed", undefined, {
      current_password: "Your current password is required",
    });
  }

  const ok = await user.verifyPassword(current_password);
  if (!ok) {
    await logActivity({
      actor: { id: user._id, role: user.role, name: user.name },
      action: "password_change_failed",
      description: `${user.name} supplied the wrong current password`,
      target_type: "user",
      target_id: String(user._id),
      ip,
    });
    throw badRequest("Validation failed", undefined, {
      current_password: "That is not your current password",
    });
  }

  await user.setPassword(new_password);
  user.must_reset_password = false;
  // Every other session for this user ends here (PRD §9.1).
  user.revokeTokens();
  await user.save();

  await logActivity({
    actor: { id: user._id, role: user.role, name: user.name },
    action: "password_changed",
    description: `${user.name} changed their password`,
    target_type: "user",
    target_id: String(user._id),
    ip,
  });

  // A fresh token so the caller is not logged out by the revocation it just
  // caused.
  const access = signAccessToken(user);
  return { ok: true, success: true, access, token: access };
}
