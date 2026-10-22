import mongoose from "mongoose";
import { serializePlugin } from "../lib/serialize.js";

/**
 * The platform settings singleton (PRD §8.2), replacing the legacy
 * `api/settings.json` file. One document, found by `key: "platform"` — a
 * fixed key rather than "whatever document happens to be first", so a stray
 * insert cannot shadow the real settings.
 *
 * `permissions` holds overrides for the permission matrix; they are merged
 * over the compiled-in defaults at boot and whenever an admin saves
 * (`config/permissions.js`).
 */
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "platform" },

  platform_name: { type: String, default: "Kids In Tech LMS" },
  welcome_message: {
    type: String,
    default: "Welcome to Kids In Tech — let's build something today.",
  },
  primary_color: { type: String, default: "#10B981" },
  logo_url: { type: String, default: "/brand/kit-logo.png" },

  /** `{ "users.manage": ["admin"], … }` — see config/permissions.js. */
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
});

settingSchema.plugin(serializePlugin);

/**
 * The settings document, created with defaults on first call.
 * Upsert rather than find-then-create so two boots racing cannot make two.
 */
settingSchema.statics.getSingleton = async function getSingleton() {
  return this.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const Setting =
  mongoose.models.Setting ?? mongoose.model("Setting", settingSchema);
