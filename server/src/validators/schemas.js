import { z } from "zod";
import { objectIdSchema } from "../middleware/validate.js";
import { paginationQuery } from "../lib/pagination.js";
import {
  ROLES,
  LANGUAGES,
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
  CONSENT_SCOPES,
} from "../config/constants.js";

/**
 * Every request body, param and query shape (PRD §10, "Input").
 *
 * `.strict()` is deliberate on write bodies: an unexpected field is a sign the
 * client and the API disagree, and silently ignoring it hides the bug. Read
 * queries are lenient, since a stray `?t=` cache-buster should not 400.
 */

const password = z
  .string({ error: "A password is required" })
  .regex(PASSWORD_RULE, PASSWORD_RULE_MESSAGE);

const name = z
  .string({ error: "A name is required" })
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be 80 characters or fewer");

const email = z
  .string({ error: "An email address is required" })
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

/** 8–18 is the programme's age range (PRD §3.1). */
const age = z.coerce
  .number({ error: "An age is required" })
  .int("Age must be a whole number")
  .min(8, "Kids In Tech is for ages 8 to 18")
  .max(18, "Kids In Tech is for ages 8 to 18");

/** Accepts either a track slug or the label the frontend's forms submit. */
const programmeTrack = z
  .string({ error: "A programme track is required" })
  .trim()
  .min(1, "A programme track is required");

const phone = z
  .string()
  .trim()
  .max(32, "Phone number is too long")
  .nullish();

// ── Auth ────────────────────────────────────────────────────────────────────

/**
 * The frontend sends the identifier as `email` whether it is an email address
 * or an admission number (`auth-options.js`), so this is a plain non-empty
 * string; `auth.service.js` decides which it is.
 */
export const loginBody = z
  .object({
    email: z.string().trim().min(1, "Enter your email or admission number").optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1, "Enter your password"),
  })
  .refine((data) => Boolean(data.email || data.identifier), {
    message: "Enter your email or admission number",
    path: ["email"],
  });

export const forgotPasswordBody = z.object({ email }).strict();

export const resetPasswordBody = z
  .object({
    token: z.string().trim().min(1).optional(),
    temp_token: z.string().trim().min(1).optional(),
    password: password.optional(),
    new_password: password.optional(),
  })
  .refine((data) => Boolean(data.password || data.new_password), {
    message: PASSWORD_RULE_MESSAGE,
    path: ["password"],
  })
  .refine((data) => Boolean(data.token || data.temp_token), {
    message: "A reset token is required",
    path: ["token"],
  });

/**
 * `temp_token` is the forced-reset path, where there is no current password to
 * supply; otherwise the current password is required and the service enforces
 * it. `token` is accepted as an alias because the frontend's force-reset
 * screen sends either name.
 */
export const changePasswordBody = z
  .object({
    current_password: z.string().min(1).optional(),
    new_password: password,
    temp_token: z.string().trim().min(1).optional(),
    token: z.string().trim().min(1).optional(),
  })
  .strict();

// ── Own profile ─────────────────────────────────────────────────────────────

export const updateProfileBody = z
  .object({
    name: name.optional(),
    phone,
    avatar_url: z.string().trim().url("Enter a valid URL").nullish(),
  })
  .strict();

export const updateLanguageBody = z
  .object({
    language_preference: z.enum(LANGUAGES, {
      error: "Invalid language code",
    }),
  })
  .strict();

// ── Admin users ─────────────────────────────────────────────────────────────

export const listUsersQuery = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  q: z.string().trim().max(120).optional(),
  ...paginationQuery,
  // The users table renders every row client-side, so default to a ceiling
  // high enough to hold a real school rather than the usual 20.
  limit: paginationQuery.limit.removeDefault().default(100),
});

export const createUserBody = z
  .object({
    role: z.enum(ROLES).default("student"),
    name,
    email: email.optional(),
    age: age.optional(),
    programme_track: programmeTrack.optional(),
    parent_id: objectIdSchema.optional(),
    language_preference: z.enum(LANGUAGES).optional(),
    // The admin "Add User" modal posts this when it is draining a pending
    // enrolment request.
    pending_id: objectIdSchema.optional(),
  })
  .strict();

export const updateUserBody = z
  .object({
    name: name.optional(),
    email: email.nullish(),
    role: z.enum(ROLES).optional(),
    age: age.optional(),
    programme_track: programmeTrack.optional(),
    language_preference: z.enum(LANGUAGES).optional(),
    phone,
  })
  .strict();

/** `{ user_id }` — the body `activateUser`/`deactivateUser` send. */
export const userIdBody = z.object({ user_id: objectIdSchema }).strict();

export const assignInstructorBody = z
  .object({
    user_id: objectIdSchema,
    course_id: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * Permissions, in either of the two shapes this endpoint serves (ADR-021):
 * the PRD's role matrix (`{ "users.manage": ["admin"] }`) or the roles
 * screen's per-administrator sections (`{ "<id>": { dashboard: true } }`).
 *
 * Validated loosely on purpose. The services decide which keys, roles and
 * ids are real and report back what they ignored; restating those lists here
 * would only let the two drift apart.
 */
export const savePermissionsBody = z
  .object({
    permissions: z
      .record(
        z.string(),
        z.union([z.array(z.enum(ROLES)), z.record(z.string(), z.boolean())])
      )
      .optional(),
  })
  .passthrough();

// ── Parents, students ───────────────────────────────────────────────────────

/**
 * A parent adding a child. `consent` is required and must be accepted: the
 * API will not create a child account on an unticked box, even though the
 * student record would simply stay `pending`.
 */
export const addChildBody = z
  .object({
    name,
    age,
    programme_track: programmeTrack,
    consent: z
      .object({
        version: z.string().trim().min(1, "A consent version is required"),
        accepted: z.literal(true, {
          error: "Parental consent must be accepted to add a child",
        }),
        scopes: z.array(z.enum(CONSENT_SCOPES)).optional(),
      })
      .strict(),
  })
  .strict();

export const studentIdParam = z.object({ id: objectIdSchema });

// ── Platform settings ───────────────────────────────────────────────────────

export const updateSettingsBody = z
  .object({
    platform_name: z.string().trim().min(1).max(80).optional(),
    welcome_message: z.string().trim().max(500).optional(),
    primary_color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Enter a hex colour such as #10B981")
      .optional(),
    logo_url: z.string().trim().min(1).optional(),
    permissions: z.record(z.string(), z.array(z.enum(ROLES))).optional(),
  })
  .strict();

// ── Notifications ───────────────────────────────────────────────────────────

/** Lenient: the frontend appends `?user_id=` from its mock-era habit. */
export const listNotificationsQuery = z.object({
  user_id: objectIdSchema.optional(),
});

export const sendNotificationBody = z
  .object({
    type: z.string().trim().max(60).optional(),
    title: z.string().trim().min(1, "A title is required").max(120),
    message: z.string().trim().max(1000).optional(),
    link: z.string().trim().max(300).nullish(),
    audience: z.enum(["all", "role", "course"]).optional(),
    target: z.string().trim().max(60).nullish(),
    // adminNotify.js sends an arbitrary event payload alongside the copy.
    priority: z.boolean().optional(),
  })
  .passthrough();
