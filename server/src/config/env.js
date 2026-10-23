import { z } from "zod";
import dotenv from "dotenv";

// Load .env before parsing. In production Render injects real environment
// variables and there is no file to read, which dotenv treats as a no-op.
//
// Never under test. A developer's local server/.env would otherwise supply
// JWT_SECRET and MONGODB_URI to the suite, so tests would run against the
// developer's settings locally and the harness's settings on CI — and a token
// signed by a test with one secret would be verified by the app with another,
// which fails in a way that looks like a bug in the code under test rather
// than in the setup. The test harness owns the environment completely.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ quiet: true });
}

const nonEmpty = (label) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} must not be empty`);

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Render supplies PORT; 4000 is what client/.env.example points at locally.
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: nonEmpty("MONGODB_URI"),
  MONGODB_DB_NAME: z.string().trim().min(1).default("kitos"),

  // 32 bytes minimum (PRD §10). Short secrets make HS256 brute-forceable,
  // which is precisely the legacy API's defect.
  JWT_SECRET: nonEmpty("JWT_SECRET").min(
    32,
    "JWT_SECRET must be at least 32 characters"
  ),
  JWT_EXPIRES_IN: z.string().trim().default("24h"),

  // The single browser origin allowed through CORS and used to build links in
  // outbound email.
  CLIENT_ORIGIN: z.string().url("CLIENT_ORIGIN must be a URL").default("http://localhost:3004"),

  STORAGE_PROVIDER: z.enum(["local", "cloudinary"]).default("local"),
  CLOUDINARY_URL: z.string().trim().optional(),

  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().trim().default("Kids In Tech <hello@kidsintech.school>"),

  // Batch 3. Absent in development: /paystack/initiate then returns a
  // simulated reference so the existing four-step modal still works.
  PAYSTACK_SECRET_KEY: z.string().trim().optional(),

  // Guards the demo seed in production (PRD §15.2, Batch 1 Part F).
  ALLOW_DEMO_SEED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DEMO_ADMIN_PASSWORD: z.string().optional(),
  DEMO_STAFF_PASSWORD: z.string().optional(),
  DEMO_FAMILY_PASSWORD: z.string().optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

/**
 * Parses process.env and fails fast, naming the variable that is wrong.
 * Exported separately from `env` so tests can exercise it without exiting.
 * @param {NodeJS.ProcessEnv} source
 */
export function parseEnv(source = process.env) {
  const result = schema.safeParse(source);

  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(root)";
      return `  - ${name}: ${issue.message}`;
    });
    throw new Error(
      `Invalid environment configuration:\n${lines.join("\n")}\n\n` +
        "See server/.env.example for the full list of variables."
    );
  }

  const parsed = result.data;

  // Cross-field rules Zod cannot express field-by-field.
  if (parsed.STORAGE_PROVIDER === "cloudinary" && !parsed.CLOUDINARY_URL) {
    throw new Error(
      "Invalid environment configuration:\n" +
        "  - CLOUDINARY_URL: required when STORAGE_PROVIDER is \"cloudinary\" (PRD §11.2)"
    );
  }

  return parsed;
}

let cached;

/**
 * The validated environment. Parsed once, on first access, so importing a
 * module that reads config does not blow up a test that never needed it.
 */
export const env = new Proxy(
  {},
  {
    get(_target, prop) {
      cached ??= parseEnv();
      return cached[prop];
    },
    has(_target, prop) {
      cached ??= parseEnv();
      return prop in cached;
    },
    ownKeys() {
      cached ??= parseEnv();
      return Reflect.ownKeys(cached);
    },
    getOwnPropertyDescriptor(_target, prop) {
      cached ??= parseEnv();
      return Reflect.getOwnPropertyDescriptor(cached, prop);
    },
  }
);

/** Test helper: forget the cached parse so a new process.env is picked up. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env.NODE_ENV === "production";
export const isTest = () => env.NODE_ENV === "test";
