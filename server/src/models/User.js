import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { serializePlugin } from "../lib/serialize.js";
import { ROLES, LANGUAGES, BCRYPT_ROUNDS } from "../config/constants.js";

/**
 * A sign-in identity for all four roles (PRD §8.2).
 *
 * Students authenticate with `admission_no` and need no email (child-safety
 * rule); everyone else uses `email`. Both indexes are **sparse** unique, so
 * the many students without an email and the many staff without an admission
 * number do not collide on `null` — a plain unique index would allow exactly
 * one such document.
 */
const userSchema = new mongoose.Schema({
  role: { type: String, enum: ROLES, required: true, index: true },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: undefined,
  },

  admission_no: {
    type: String,
    uppercase: true,
    trim: true,
    default: undefined,
  },

  name: { type: String, required: true, trim: true },

  password_hash: { type: String, required: true, select: false },

  is_active: { type: Boolean, default: true },

  language_preference: { type: String, enum: LANGUAGES, default: "en" },

  /**
   * Set on admin-provisioned accounts. A flag, never inferred by comparing
   * against a default password as the legacy API did.
   */
  must_reset_password: { type: Boolean, default: false },

  /**
   * Incremented to revoke every token already issued to this user. Compared
   * against the `tv` claim on each request, so a password change or a
   * deactivation takes effect on the very next call rather than in 24 hours.
   */
  token_version: { type: Number, default: 0, select: false },

  avatar_url: { type: String, default: null },
  phone: { type: String, default: null },

  /** Instructor biography, shown on the instructor profile screen. */
  bio: { type: String, default: null },

  last_login_at: { type: Date, default: null },

  reset_token_hash: { type: String, default: null, select: false },
  reset_token_expires_at: { type: Date, default: null, select: false },
});

userSchema.plugin(serializePlugin);

userSchema.index(
  { email: 1 },
  { unique: true, sparse: true, collation: { locale: "en", strength: 2 } }
);
userSchema.index({ admission_no: 1 }, { unique: true, sparse: true });

/** Keeps an absent identifier truly absent, so the sparse index skips it. */
userSchema.pre("validate", function normaliseIdentifiers(next) {
  if (this.email === null || this.email === "") this.email = undefined;
  if (this.admission_no === null || this.admission_no === "") {
    this.admission_no = undefined;
  }
  next();
});

/** Either identifier will do, but a user with neither could never sign in. */
userSchema.pre("validate", function requireAnIdentifier(next) {
  if (!this.email && !this.admission_no) {
    this.invalidate(
      "email",
      "A user needs an email address or an admission number"
    );
  }
  next();
});

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Constant-time password check.
 * `password_hash` is `select: false`, so callers must load it explicitly;
 * this throws rather than returning false if they forgot, because a silent
 * false would read as "wrong password" and be very hard to debug.
 */
userSchema.methods.verifyPassword = async function verifyPassword(plain) {
  if (!this.password_hash) {
    throw new Error(
      "verifyPassword called on a User loaded without password_hash — add .select(\"+password_hash\")"
    );
  }
  return bcrypt.compare(plain, this.password_hash);
};

userSchema.methods.setPassword = async function setPassword(plain) {
  this.password_hash = await hashPassword(plain);
};

/** Revokes every token issued so far. */
userSchema.methods.revokeTokens = function revokeTokens() {
  this.token_version = (this.token_version ?? 0) + 1;
};

/**
 * The user object the frontend's auth flow expects — the fields
 * `auth-options.js` copies into the NextAuth session.
 */
userSchema.methods.toAuthJSON = function toAuthJSON() {
  return {
    id: String(this._id),
    email: this.email ?? null,
    admission_no: this.admission_no ?? null,
    role: this.role,
    name: this.name,
    language_preference: this.language_preference,
    must_reset_password: Boolean(this.must_reset_password),
  };
};

/**
 * The row shape the admin users table reads (handlers.js `ADMIN_USERS`):
 * `status` rather than `is_active`, and ISO `created_at`.
 */
userSchema.methods.toAdminJSON = function toAdminJSON(extra = {}) {
  return {
    id: String(this._id),
    role: this.role,
    name: this.name,
    email: this.email ?? null,
    admission_no: this.admission_no ?? null,
    status: this.is_active ? "active" : "inactive",
    language_preference: this.language_preference,
    must_reset_password: Boolean(this.must_reset_password),
    avatar_url: this.avatar_url ?? null,
    phone: this.phone ?? null,
    last_login_at: this.last_login_at?.toISOString() ?? null,
    created_at: this.created_at?.toISOString() ?? null,
    ...extra,
  };
};

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
