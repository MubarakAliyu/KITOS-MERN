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
  messageLimiter,
} from "../middleware/rateLimit.js";
import * as s from "../validators/schemas.js";
import { learningRouter } from "./learning.js";

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
 * with a `temp_token` before any session exists. The service requires a valid
 * temp token **and** the temporary password, or an authenticated user and
 * their current password, so this is not an open endpoint.
 */
router.post(
  "/user/change-password",
  passwordChangeLimiter,
  validate({ body: s.changePasswordBody }),
  async (req, res, next) => {
    /**
     * A `temp_token` in the body means a forced first-login change, and that
     * path never authenticates.
     *
     * This used to branch on the Authorization header alone, which broke the
     * flow in production. The client's NextAuth session for a must-change
     * account carried the temp token as its `accessToken`, so the axios
     * interceptor sent it as a Bearer credential; `authenticate` then
     * correctly refused it — "a password-reset token cannot be used to
     * authenticate a request" — and answered 401 before the service, which
     * handles temp tokens perfectly well, was ever reached. The user could
     * not set a password, so they could not sign in at all.
     *
     * The client no longer puts a reset token in that header. The body is
     * what decides here regardless, because which flow this is cannot depend
     * on a header the caller may or may not have attached.
     */
    if (req.body?.temp_token || req.body?.token) {
      c.postChangePassword(req, res, next);
      return;
    }
    // Otherwise attach the user, so a signed-in person changing their
    // password still has their current one checked.
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

/**
 * Issues a new temporary password. Admin only, by role as well as by
 * permission: `users.manage` is the permission an administrator has, and
 * naming the role too means a future grant of that permission to anyone
 * else does not quietly hand out password resets with it.
 */
router.post(
  "/admin/users/:id/reset-password",
  authenticate,
  requireRole("admin"),
  requirePermission("users.manage"),
  validate({ params: idParamSchema }),
  c.postResetUserPassword
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
  validate({ query: s.activityLogQuery }),
  c.getActivityLog
);

router.get(
  "/admin/analytics",
  authenticate,
  requirePermission("analytics.view"),
  validate({ query: s.analyticsQuery }),
  c.getAdminAnalytics
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

// ── Notifications ───────────────────────────────────────────────────────────
// The model ships in Batch 1 and already holds real rows, so the read side is
// implemented here rather than 404ing the bell on every dashboard (ADR-019).

router.get(
  "/notifications",
  authenticate,
  validate({ query: s.listNotificationsQuery }),
  c.getNotifications
);

router.put(
  "/notifications/read-all",
  authenticate,
  c.putNotificationsReadAll
);

router.put(
  "/notifications/:id/read",
  authenticate,
  validate({ params: idParamSchema }),
  c.putNotificationRead
);

/**
 * Shared by the admin Announcement modal and by adminNotify.js, which fires
 * platform events from any signed-in user. The service decides the audience:
 * a non-admin can only ever notify administrators.
 */
router.post(
  "/admin/notifications/send",
  authenticate,
  requirePermission("chat.use"),
  validate({ body: s.sendNotificationBody }),
  c.postSendNotification
);

// ── Batch 3: chat ───────────────────────────────────────────────────────────
// Who may talk to whom is decided in chat.service.js (PRD §10), not here: the
// matrix grants `chat.use` to every role, and the pair rules narrow it.

router.get(
  "/conversations",
  authenticate,
  requirePermission("chat.use"),
  validate({ query: s.listConversationsQuery }),
  c.getConversations
);

/** Literal path before `/messages`, so it is not read as a query-less list. */
router.put(
  "/messages/read",
  authenticate,
  requirePermission("chat.use"),
  validate({ body: s.markReadBody }),
  c.putMessagesRead
);

router.get(
  "/messages",
  authenticate,
  requirePermission("chat.use"),
  validate({ query: s.listMessagesQuery }),
  c.getMessages
);

router.post(
  "/messages",
  authenticate,
  requirePermission("chat.use"),
  messageLimiter,
  validate({ body: s.sendMessageBody }),
  c.postMessage
);

router.get(
  "/chat/contacts",
  authenticate,
  requirePermission("chat.use"),
  c.getContactable
);

router.post(
  "/chat/report",
  authenticate,
  requirePermission("chat.use"),
  validate({ body: s.reportConversationBody }),
  c.postReportConversation
);

router.get(
  "/admin/chat/all-conversations",
  authenticate,
  requirePermission("chat.monitor"),
  c.getAllConversations
);

// ── Batch 3: payments (PRD §11.1) ───────────────────────────────────────────

/**
 * Public, and authenticated by the `verif-hash` header rather than by token:
 * Flutterwave calls it, not a browser. It is deliberately not validated with
 * Zod — the body is third-party and is never acted on, only read for the
 * reference to re-verify against the API (ADR-036).
 */
router.post("/payments/webhook", c.postPaymentWebhook);

router.post(
  "/payments/initiate",
  authenticate,
  requirePermission("payment.make"),
  validate({ body: s.initiatePaymentBody }),
  c.postInitiatePayment
);

router.post(
  "/payments/verify",
  authenticate,
  requirePermission("payment.make"),
  validate({ body: s.verifyPaymentBody }),
  c.postVerifyPayment
);

/** Literal paths before `/payments/:id/receipt`, so neither shadows the other. */
router.get(
  "/payments/stats",
  authenticate,
  requirePermission("payment.view"),
  c.getPaymentStats
);

router.get(
  "/payments/:id/receipt",
  authenticate,
  requirePermission("payment.view"),
  validate({ params: idParamSchema, query: s.receiptQuery }),
  c.getReceipt
);

router.get(
  "/payments",
  authenticate,
  requirePermission("payment.view"),
  validate({ query: s.listPaymentsQuery }),
  c.getPayments
);

router.get(
  "/subscriptions",
  authenticate,
  requirePermission("payment.view"),
  c.getSubscriptions
);

router.post(
  "/subscriptions/cancel",
  authenticate,
  requirePermission("payment.make"),
  validate({ body: s.cancelSubscriptionBody }),
  c.postCancelSubscription
);

router.get(
  "/admin/payments",
  authenticate,
  requirePermission("analytics.view"),
  validate({ query: s.listPaymentsQuery }),
  c.getAdminPayments
);

// ── Batch 2: learning, assessment, certificates and sessions ────────────────
router.use(learningRouter);
