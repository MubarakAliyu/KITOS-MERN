import { User } from "../models/User.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { unauthorized, forbidden } from "../lib/errors.js";
import { can } from "../config/permissions.js";

/**
 * Authenticates a Bearer token.
 *
 * Four things must all hold, in this order:
 *   1. the token's HS256 signature verifies against JWT_SECRET and it has not
 *      expired (`verifyAccessToken`, which pins the algorithm so an
 *      `alg: "none"` token is rejected rather than read);
 *   2. the user still exists;
 *   3. the account is active;
 *   4. the token's `tv` claim matches the user's current `token_version`.
 *
 * Step 4 is what makes revocation immediate: a password change or a
 * deactivation increments `token_version`, so every token issued before it
 * stops working on the next request instead of lingering for 24 hours.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");

    if (!/^Bearer$/i.test(scheme ?? "") || !token) {
      throw unauthorized(
        "Authentication required",
        "Provide an Authorization: Bearer <token> header"
      );
    }

    const payload = verifyAccessToken(token);

    // token_version is select:false, so ask for it explicitly.
    const user = await User.findById(payload.sub).select("+token_version");

    if (!user) {
      throw unauthorized("Invalid token", "The account on this token no longer exists");
    }

    if (!user.is_active) {
      throw unauthorized(
        "Account deactivated",
        "This account has been deactivated — contact an administrator"
      );
    }

    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      throw unauthorized(
        "Session expired",
        "This session was ended — please sign in again"
      );
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate a route on one permission key from the matrix (PRD §10.1).
 *
 * This answers only "may this role ever do this?". Narrowing to a specific
 * record — a parent's own child, an instructor's own course — is the service's
 * job, and both checks must pass.
 *
 * @param {string} key
 */
export function requirePermission(key) {
  return function checkPermission(req, _res, next) {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }

    if (!can(req.user.role, key)) {
      next(
        forbidden(
          "You do not have permission to do that",
          `Requires the "${key}" permission`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Restricts a route to specific roles where no permission key fits — the
 * "/parents/me"-style endpoints, which are about whose profile is being
 * fetched rather than about a capability.
 * @param {...string} roles
 */
export function requireRole(...roles) {
  return function checkRole(req, _res, next) {
    if (!req.user) {
      next(unauthorized("Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(
        forbidden(
          "You do not have permission to do that",
          `This endpoint is for: ${roles.join(", ")}`
        )
      );
      return;
    }
    next();
  };
}
