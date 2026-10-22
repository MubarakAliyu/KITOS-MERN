import { Router } from "express";

import * as c from "../controllers/index.js";
import { validate, idParamSchema } from "../middleware/validate.js";
import {
  authenticate,
  requirePermission,
  requireRole,
} from "../middleware/authenticate.js";
import {
  loginLimiter,
  forgotPasswordLimiter,
  passwordChangeLimiter,
} from "../middleware/rateLimit.js";
import * as s from "../validators/schemas.js";

/**
 * Every Batch 1 route.
 *
 * Paths match the frontend's contract exactly and carry no `/api/v1` prefix
 * (ADR-005): the client calls `/login`, `/admin/users`, … relative to
 * `NEXT_PUBLIC_API_URL`.
 *
 * Reading order per route: rate limit → authenticate → permission → validate
 * → controller. Authorisation therefore happens before a body is parsed, and
 * ownership narrowing happens inside the service.
 */
export const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────

router.get("/health", c.getHealth);

router.post(
  "/login",
  loginLimiter,
  validate({ body: s.loginBody }),
  c.postLogin
);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate({ body: s.forgotPasswordBody }),
  c.postForgotPassword
);

router.post(
  "/reset-password",
  passwordChangeLimiter,
  validate({ body: s.resetPasswordBody }),
  c.postResetPassword
);

/**
 * Deliberately not behind `authenticate`: the forced-reset screen posts here
 * with a `temp_token` before any session exists. The service requires either a
 * valid temp token or an authenticated user, so this is not an open endpoint.
 */
router.post(
  "/user/change-password",
  passwordChangeLimiter,
  validate({ body: s.changePasswordBody }),
  async (req, res, next) => {
    // Attach the user when a normal Bearer token is present, so a signed-in
    // user changing their password still has their current one checked.
    if (req.headers.authorization) {
      authenticate(req, res, (err) => (err ? next(err) : c.postChangePassword(req, res, next)));
      return;
    }
    c.postChangePassword(req, res, next);
  }
);

// ── Signed-in: own account ──────────────────────────────────────────────────

router.get("/user/me", authenticate, c.getMe);

router.put(
  "/user/profile",
  authenticate,
  validate({ body: s.updateProfileBody }),
  c.putProfile
);

router.put(
  "/user/language",
  authenticate,
  validate({ body: s.updateLanguageBody }),
  c.putLanguage
);

// ── Admin: users ────────────────────────────────────────────────────────────

router.get(
  "/admin/users",
  authenticate,
  requirePermission("users.manage"),
  validate({ query: s.listUsersQuery }),
  c.getAdminUsers
);

router.post(
  "/admin/users",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.createUserBody }),
  c.postAdminUsers
);

router.put(
  "/admin/users/:id",
  authenticate,
  requirePermission("users.manage"),
  validate({ params: idParamSchema, body: s.updateUserBody }),
  c.putAdminUser
);

router.post(
  "/admin/users/activate",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.userIdBody }),
  c.postActivateUser
);

router.post(
  "/admin/users/deactivate",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.userIdBody }),
  c.postDeactivateUser
);

router.post(
  "/admin/users/assign-instructor",
  authenticate,
  requirePermission("users.manage"),
  validate({ body: s.assignInstructorBody }),
  c.postAssignInstructor
);

router.get(
  "/admin/next-admission-no",
  authenticate,
  requirePermission("users.manage"),
  c.getNextAdmissionNo
);

// ── Admin: oversight ────────────────────────────────────────────────────────

router.post(
  "/admin/permissions",
  authenticate,
  requirePermission("settings.manage"),
  validate({ body: s.savePermissionsBody }),
  c.postPermissions
);

router.get(
  "/admin/activity-log",
  authenticate,
  requirePermission("audit.view"),
  c.getActivityLog
);

router.get(
  "/admin/pending-enrollments",
  authenticate,
  requirePermission("users.manage"),
  c.getPendingEnrollments
);

router.get(
  "/admin/stats",
  authenticate,
  requirePermission("analytics.view"),
  c.getAdminStats
);

// ── Parents ─────────────────────────────────────────────────────────────────

router.get("/parents/me", authenticate, requireRole("parent"), c.getParentMe);

router.get(
  "/parents/me/children",
  authenticate,
  requireRole("parent"),
  c.getParentChildren
);

/**
 * A parent adds a child. `child.manage` is a parent-only permission, so the
 * matrix alone keeps every other role out.
 */
router.post(
  "/students",
  authenticate,
  requirePermission("child.manage"),
  validate({ body: s.addChildBody }),
  c.postStudents
);

// ── Students ────────────────────────────────────────────────────────────────

router.get(
  "/students/me",
  authenticate,
  requireRole("student"),
  c.getStudentMe
);

/**
 * Ownership is decided in the service: a parent may read their own child, a
 * student their own record, an admin anyone.
 */
router.get(
  "/students/:id/progress",
  authenticate,
  requirePermission("content.read"),
  validate({ params: s.studentIdParam }),
  c.getStudentProgress
);

// ── Instructors ─────────────────────────────────────────────────────────────

router.get(
  "/instructors/me",
  authenticate,
  requireRole("instructor"),
  c.getInstructorMe
);

router.get(
  "/instructors/me/courses",
  authenticate,
  requireRole("instructor", "admin"),
  c.getInstructorCourses
);

router.get(
  "/instructors/me/students",
  authenticate,
  requireRole("instructor", "admin"),
  c.getInstructorStudents
);

// ── Platform settings ───────────────────────────────────────────────────────

/** Readable by any signed-in user — the UI reads the platform name and logo. */
router.get("/platform/settings", authenticate, c.getPlatformSettings);

router.post(
  "/platform/settings",
  authenticate,
  requirePermission("settings.manage"),
  validate({ body: s.updateSettingsBody }),
  c.postPlatformSettings
);
