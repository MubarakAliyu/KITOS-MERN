import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";
import * as adminService from "../services/admin.service.js";
import * as familyService from "../services/family.service.js";
import * as settingsService from "../services/settings.service.js";
import * as notificationService from "../services/notification.service.js";
import { clientIp, logActivity } from "../lib/audit.js";
import { badRequest } from "../lib/errors.js";
import { dbStatus } from "../config/db.js";

/**
 * Controllers (PRD §7.4): unpack the request, call one service, send the
 * response. No business rules here, and services never see `req`.
 */

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 * Express 5 forwards rejections itself, but being explicit keeps the intent
 * obvious and survives a downgrade.
 */
const handle = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** The actor shape the audit log wants, from the authenticated user. */
const actorOf = (req) =>
  req.user
    ? { id: String(req.user._id), role: req.user.role, name: req.user.name }
    : null;

// ── Health ──────────────────────────────────────────────────────────────────

export const getHealth = handle(async (_req, res) => {
  const db = dbStatus();
  res.status(200).json({
    ok: true,
    db,
    version: process.env.npm_package_version ?? "2.0.0",
  });
});

// ── Auth ────────────────────────────────────────────────────────────────────

export const postLogin = handle(async (req, res) => {
  const result = await authService.login({
    identifier: req.body.email ?? req.body.identifier,
    password: req.body.password,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

export const postForgotPassword = handle(async (req, res) => {
  const result = await authService.requestPasswordReset({
    email: req.body.email,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

export const postResetPassword = handle(async (req, res) => {
  const result = await authService.resetPassword({
    token: req.body.token,
    temp_token: req.body.temp_token,
    password: req.body.password ?? req.body.new_password,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

/**
 * Change password. Unauthenticated when it carries a `temp_token` (the
 * forced-reset screen runs before a session exists), authenticated otherwise.
 */
export const postChangePassword = handle(async (req, res) => {
  const result = await authService.changePassword({
    user: req.user,
    current_password: req.body.current_password,
    new_password: req.body.new_password,
    temp_token: req.body.temp_token ?? req.body.token,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

// ── Own profile ─────────────────────────────────────────────────────────────

export const putProfile = handle(async (req, res) => {
  const result = await userService.updateProfile({
    user: req.user,
    patch: req.body,
    ip: clientIp(req),
  });
  res.status(200).json(result);
});

export const putLanguage = handle(async (req, res) => {
  const result = await userService.updateLanguage({
    user: req.user,
    language_preference: req.body.language_preference,
  });
  res.status(200).json(result);
});

export const getMe = handle(async (req, res) => {
  res.status(200).json(await userService.getMe(req.user));
});

// ── Admin users ─────────────────────────────────────────────────────────────

export const getAdminUsers = handle(async (req, res) => {
  res.status(200).json(await adminService.listUsers(req.query));
});

export const postAdminUsers = handle(async (req, res) => {
  const created = await adminService.createUser(
    req.body,
    actorOf(req),
    clientIp(req)
  );
  res.status(201).json(created);
});

export const putAdminUser = handle(async (req, res) => {
  const updated = await adminService.updateUser(
    req.params.id,
    req.body,
    actorOf(req),
    clientIp(req)
  );
  res.status(200).json(updated);
});

export const postActivateUser = handle(async (req, res) => {
  const result = await adminService.setUserActive(
    req.body.user_id,
    "activate",
    actorOf(req),
    clientIp(req)
  );
  res.status(200).json(result);
});

export const postDeactivateUser = handle(async (req, res) => {
  const result = await adminService.setUserActive(
    req.body.user_id,
    "deactivate",
    actorOf(req),
    clientIp(req)
  );
  res.status(200).json(result);
});

export const postAssignInstructor = handle(async (req, res) => {
  const result = await adminService.assignInstructor(
    req.body,
    actorOf(req),
    clientIp(req)
  );
  res.status(200).json(result);
});

export const getNextAdmissionNo = handle(async (_req, res) => {
  res.status(200).json(await adminService.nextAdmissionNoPreview());
});

export const getActivityLog = handle(async (req, res) => {
  res.status(200).json(await adminService.listActivityLog(req.query));
});

export const getPendingEnrollments = handle(async (_req, res) => {
  res.status(200).json(await adminService.listPendingEnrollments());
});

export const getAdminStats = handle(async (_req, res) => {
  res.status(200).json(await adminService.getStats());
});

export const postPermissions = handle(async (req, res) => {
  // The screen posts `{ permissions: {…} }`; the matrix may also be posted
  // as the body itself.
  const payload = req.body.permissions ?? req.body;
  const kind = settingsService.classifyPermissionsPayload(payload);

  if (kind === "admin_sections") {
    // What the roles-and-permissions screen actually sends (ADR-021):
    // per-administrator dashboard sections.
    const result = await settingsService.saveAdminSections(payload);

    await logActivity({
      actor: actorOf(req),
      action: "updated_permissions",
      description: `Updated dashboard sections for ${result.applied.length} administrator(s)`,
      target_type: "admin_sections",
      meta: { applied: result.applied, ignored: result.ignored },
      ip: clientIp(req),
    });

    res.status(200).json({ success: true, ...result });
    return;
  }

  if (kind === "mixed") {
    throw badRequest(
      "Unrecognised permissions payload",
      "Send either role-matrix overrides keyed by permission name, or dashboard sections keyed by administrator id — not both at once"
    );
  }

  // The PRD's role matrix — what the server actually enforces.
  const result = await settingsService.savePermissions(payload);

  await logActivity({
    actor: actorOf(req),
    action: "updated_permissions",
    description: `Updated role permissions (${result.applied.length} changed)`,
    target_type: "permissions",
    meta: { applied: result.applied, ignored: result.ignored },
    ip: clientIp(req),
  });

  res.status(200).json({ success: true, ...result });
});

// ── Parents and students ────────────────────────────────────────────────────

export const getParentMe = handle(async (req, res) => {
  res.status(200).json(familyService.getParentProfile(req.user));
});

export const getParentChildren = handle(async (req, res) => {
  res.status(200).json(await familyService.listChildren(req.user));
});

export const postStudents = handle(async (req, res) => {
  const created = await familyService.addChild({
    parent: req.user,
    payload: req.body,
    ip: clientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.status(201).json(created);
});

export const getStudentMe = handle(async (req, res) => {
  res.status(200).json(await familyService.getStudentProfile(req.user));
});

export const getStudentProgress = handle(async (req, res) => {
  const progress = await familyService.getStudentProgress({
    studentId: req.params.id,
    requester: req.user,
  });
  res.status(200).json(progress);
});

// ── Instructors ─────────────────────────────────────────────────────────────

export const getInstructorMe = handle(async (req, res) => {
  res.status(200).json(familyService.getInstructorProfile(req.user));
});

/**
 * Courses and students for an instructor arrive in Batch 2. Empty arrays
 * rather than 404s, so the dashboard shows its empty state instead of an
 * error (AC1.1).
 */
export const getInstructorCourses = handle(async (_req, res) => {
  res.status(200).json([]);
});

export const getInstructorStudents = handle(async (_req, res) => {
  res.status(200).json([]);
});

// ── Platform settings ───────────────────────────────────────────────────────

export const getPlatformSettings = handle(async (_req, res) => {
  res.status(200).json(await settingsService.getSettings());
});

export const postPlatformSettings = handle(async (req, res) => {
  const { permissions, ...presentation } = req.body;

  const settings = await settingsService.updateSettings(presentation);
  if (permissions) await settingsService.savePermissions(permissions);

  await logActivity({
    actor: actorOf(req),
    action: "updated_settings",
    description: "Updated platform settings",
    target_type: "settings",
    meta: { fields: Object.keys(presentation) },
    ip: clientIp(req),
  });

  res
    .status(200)
    .json(permissions ? await settingsService.getSettings() : settings);
});

// ── Notifications ───────────────────────────────────────────────────────────

export const getNotifications = handle(async (req, res) => {
  const rows = await notificationService.listNotifications({
    user: req.user,
    userId: req.query.user_id,
  });
  res.status(200).json(rows);
});

export const putNotificationRead = handle(async (req, res) => {
  const result = await notificationService.markRead({
    user: req.user,
    id: req.params.id,
  });
  res.status(200).json(result);
});

export const putNotificationsReadAll = handle(async (req, res) => {
  res.status(200).json(await notificationService.markAllRead({ user: req.user }));
});

export const postSendNotification = handle(async (req, res) => {
  const result = await notificationService.sendNotification({
    user: req.user,
    payload: req.body,
  });
  res.status(200).json(result);
});
