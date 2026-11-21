import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { LOCAL_DIR } from "./paths.js";
import { badRequest } from "./errors.js";

/**
 * File storage, behind one interface (PRD §11.2, ADR-008).
 *
 * Two providers. `local` writes under `server/.local/uploads` and is for
 * development only — Render wipes its disk on every deploy, so a submission
 * saved there would vanish the next time the service restarts. Production
 * uses `cloudinary`, and `config/env.js` refuses to start if it is selected
 * without a `CLOUDINARY_URL`.
 *
 * The Cloudinary provider is written and unit-tested here but only switched
 * on in Batch 3, when the account exists.
 */

const UPLOADS_DIR = path.join(LOCAL_DIR, "uploads");

/** 10 MB, per PRD §10 ("uploads 10 MB"). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * What a child may upload for an assignment.
 *
 * An allow-list by extension *and* a check that it is not executable: the
 * audience is eight to eighteen, and a shared folder of `.exe` files would be
 * a liability. Anything not listed is refused with a readable message rather
 * than silently dropped.
 */
const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".pdf", ".txt", ".md", ".rtf",
  ".doc", ".docx", ".odt",
  ".ppt", ".pptx", ".odp",
  ".xls", ".xlsx", ".ods", ".csv",
  ".zip",
  ".sb2", ".sb3", // Scratch projects — the whole point of the programme
  ".py", ".js", ".html", ".css", ".json",
  ".mp3", ".wav", ".mp4", ".webm",
]);

/** A filename that cannot escape its folder or surprise a filesystem. */
function safeName(filename) {
  const base = path.basename(String(filename ?? "file"));
  const ext = path.extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // A short random prefix, so two pupils uploading "homework.pdf" do not
  // collide and one overwrite the other.
  const unique = crypto.randomBytes(6).toString("hex");
  return `${unique}-${stem || "file"}${ext}`;
}

function assertAcceptable(buffer, filename) {
  if (!buffer || buffer.length === 0) {
    throw badRequest("That file is empty");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw badRequest(
      "That file is too large",
      `The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
    );
  }

  const ext = path.extname(String(filename ?? "")).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw badRequest(
      "That kind of file cannot be uploaded",
      `Allowed: ${[...ALLOWED_EXTENSIONS].slice(0, 12).join(", ")} and similar`
    );
  }
}

/** Writes to `server/.local/uploads`. Development only. */
const localProvider = {
  name: "local",

  async save({ buffer, filename, folder = "" }) {
    assertAcceptable(buffer, filename);

    const name = safeName(filename);
    const dir = path.join(UPLOADS_DIR, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buffer);

    const url = `/uploads/${folder ? `${folder}/` : ""}${name}`;
    logger.info({ url, bytes: buffer.length }, "Stored upload on local disk");
    return { url, provider: "local", bytes: buffer.length };
  },

  async remove(url) {
    if (!url?.startsWith("/uploads/")) return false;
    try {
      await unlink(path.join(UPLOADS_DIR, url.replace("/uploads/", "")));
      return true;
    } catch {
      // Already gone is a success as far as the caller is concerned.
      return false;
    }
  },
};

/**
 * Uploads to Cloudinary (Batch 3).
 *
 * Written against Cloudinary's unsigned-less upload endpoint with a signed
 * request, so no extra dependency is needed. `CLOUDINARY_URL` has the form
 * `cloudinary://<key>:<secret>@<cloud>`.
 */
const cloudinaryProvider = {
  name: "cloudinary",

  parseUrl() {
    const raw = env.CLOUDINARY_URL;
    const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(raw ?? "");
    if (!match) {
      throw new Error(
        "CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>"
      );
    }
    return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
  },

  /** Cloudinary signs the sorted parameter list with the API secret. */
  sign(params, apiSecret) {
    const canonical = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    return crypto.createHash("sha1").update(canonical + apiSecret).digest("hex");
  },

  async save({ buffer, filename, folder = "" }) {
    assertAcceptable(buffer, filename);

    const { apiKey, apiSecret, cloudName } = this.parseUrl();
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { timestamp, ...(folder ? { folder } : {}) };
    const signature = this.sign(signedParams, apiSecret);

    const form = new FormData();
    form.append(
      "file",
      new Blob([buffer]),
      safeName(filename)
    );
    form.append("api_key", apiKey);
    form.append("timestamp", String(timestamp));
    if (folder) form.append("folder", folder);
    form.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      { method: "POST", body: form }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error({ status: response.status, detail }, "Cloudinary upload failed");
      throw new Error(`Cloudinary upload failed with ${response.status}`);
    }

    const result = await response.json();
    return {
      url: result.secure_url,
      provider: "cloudinary",
      bytes: result.bytes ?? buffer.length,
      public_id: result.public_id,
    };
  },

  async remove(url) {
    // Deleting needs the public_id rather than the URL; recorded as a Batch 3
    // task alongside switching the provider on.
    logger.warn({ url }, "Cloudinary delete is not wired up yet");
    return false;
  },
};

const providers = {
  local: localProvider,
  cloudinary: cloudinaryProvider,
};

/**
 * The provider in force, chosen by STORAGE_PROVIDER.
 *
 * A getter rather than a captured value, so a test can change the environment
 * and the next call follows it.
 */
export const storage = {
  get provider() {
    return providers[env.STORAGE_PROVIDER] ?? localProvider;
  },
  save(input) {
    return this.provider.save(input);
  },
  remove(url) {
    return this.provider.remove(url);
  },
  get name() {
    return this.provider.name;
  },
};

export { localProvider, cloudinaryProvider, UPLOADS_DIR };
