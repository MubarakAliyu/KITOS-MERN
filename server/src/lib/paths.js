import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filesystem anchors, resolved from this module's own location.
 *
 * Never `path.resolve("server/.local/…")`: that is relative to the *current
 * working directory*, so it lands in `server/server/.local` when npm runs a
 * script from inside `server/` — outside the `.gitignore` rule, and in a
 * different place again if the process is started from the repository root.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** `server/` — two levels up from `src/lib/`. */
export const SERVER_ROOT = path.resolve(here, "..", "..");

/** The repository root, one above `server/`. */
export const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

/** `server/.local/` — git-ignored scratch space for local-only state. */
export const LOCAL_DIR = path.join(SERVER_ROOT, ".local");

/** Where the local replica set keeps its data between runs. */
export const MONGO_DATA_DIR = path.join(LOCAL_DIR, "mongo");

/** Where mail goes when SMTP is not configured. */
export const OUTBOX_DIR = path.join(LOCAL_DIR, "outbox");

/** `docs/` in the repository root. */
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
