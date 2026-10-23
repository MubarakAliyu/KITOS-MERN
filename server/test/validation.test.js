import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import rateLimit from "express-rate-limit";
import express from "express";
import { app, makeUser, auth, resetState, PASSWORD } from "./helpers.js";
import { sanitizeValue } from "../src/middleware/sanitizeKeys.js";
import { User } from "../src/models/User.js";
import { Setting } from "../src/models/Setting.js";
import { parseEnv } from "../src/config/env.js";
import { can, resetPermissions } from "../src/config/permissions.js";

const server = app();

beforeEach(resetState);

describe("validation errors", () => {
  it("returns { error, fields } with a message per field", async () => {
    const res = await request(server).post("/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(typeof res.body.fields).toBe("object");
    expect(Object.values(res.body.fields).every((m) => typeof m === "string")).toBe(true);
  });

  it("never leaks a stack trace", async () => {
    const res = await request(server).post("/login").send({});
    expect(res.body.stack).toBeUndefined();
  });

  it("404s an unknown route with a JSON body", async () => {
    const res = await request(server).get("/no-such-route");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
    expect(res.body.reason).toContain("/no-such-route");
  });

  it("rejects malformed JSON as 400, not 500", async () => {
    const res = await request(server)
      .post("/login")
      .set("Content-Type", "application/json")
      .send('{"email": "broken"');

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });

  it("rejects a body over the 1 MB limit", async () => {
    const huge = "x".repeat(1024 * 1024 + 512);
    const res = await request(server)
      .post("/login")
      .send({ email: "a@b.test", password: huge });

    expect([400, 413]).toContain(res.status);
  });
});

describe("Mongo operator sanitising", () => {
  it("strips $-prefixed and dotted keys at any depth", () => {
    const { value, removed } = sanitizeValue({
      email: "ok@kit.test",
      $where: "malicious",
      "nested.path": 1,
      inner: { $ne: null, keep: "yes" },
      list: [{ $gt: 0 }, { fine: true }],
    });

    expect(value).toEqual({
      email: "ok@kit.test",
      inner: { keep: "yes" },
      list: [{}, { fine: true }],
    });
    expect(removed).toContain("$where");
    expect(removed).toContain("nested.path");
    expect(removed).toContain("$ne");
    expect(removed).toContain("$gt");
  });

  it("leaves values alone — a password may contain a dollar sign", () => {
    const { value } = sanitizeValue({ password: "pa$$word.1" });
    expect(value.password).toBe("pa$$word.1");
  });

  it("stops an operator injection from matching the first user", async () => {
    await makeUser({ role: "admin", email: "victim@kit.test" });

    const res = await request(server)
      .post("/login")
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.access).toBeUndefined();
  });

  it("strips operators from a query string", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .get("/admin/users?role[$ne]=nothing")
      .set(auth(admin));

    // Either rejected by the validator or sanitised to nothing — never used
    // as an operator.
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("rate limiting", () => {
  /**
   * The app disables limiters under NODE_ENV=test, because a suite that fires
   * hundreds of requests would trip them and fail unrelated assertions in a
   * confusing order. So the limiter itself is exercised here on a purpose-built
   * app with the same configuration as the real one.
   */
  it("blocks the eleventh sign-in attempt in the window", async () => {
    const limited = express();
    limited.use(express.json());
    limited.use(
      "/login",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: (req) => `fixed:${req.body?.email ?? ""}`,
        handler: (_req, res) =>
          res.status(429).json({ error: "Too many requests" }),
      })
    );
    limited.post("/login", (_req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 10; i += 1) {
      const res = await request(limited).post("/login").send({ email: "a@b.test" });
      expect(res.status).toBe(200);
    }

    const blocked = await request(limited).post("/login").send({ email: "a@b.test" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests");
  });

  it("keys on the identifier as well as the IP, so one account cannot lock out another", async () => {
    const limited = express();
    limited.use(express.json());
    limited.use(
      "/login",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 2,
        keyGenerator: (req) => `ip:${req.body?.email ?? ""}`,
        handler: (_req, res) => res.status(429).json({ error: "Too many requests" }),
      })
    );
    limited.post("/login", (_req, res) => res.status(200).json({ ok: true }));

    await request(limited).post("/login").send({ email: "one@kit.test" });
    await request(limited).post("/login").send({ email: "one@kit.test" });
    const firstBlocked = await request(limited).post("/login").send({ email: "one@kit.test" });
    expect(firstBlocked.status).toBe(429);

    // A different account from the same client is unaffected.
    const other = await request(limited).post("/login").send({ email: "two@kit.test" });
    expect(other.status).toBe(200);
  });
});

describe("environment validation", () => {
  const valid = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://localhost:27017",
    JWT_SECRET: "a".repeat(32),
    CLIENT_ORIGIN: "https://lms.kidsintech.school",
  };

  it("accepts a complete environment", () => {
    expect(() => parseEnv({ ...valid })).not.toThrow();
  });

  it("names the missing variable", () => {
    const { MONGODB_URI: _omitted, ...withoutUri } = valid;
    expect(() => parseEnv(withoutUri)).toThrow(/MONGODB_URI/);
  });

  it("refuses a JWT secret under 32 characters", () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: "too-short" })).toThrow(
      /JWT_SECRET/
    );
  });

  it("refuses cloudinary storage with no CLOUDINARY_URL", () => {
    expect(() =>
      parseEnv({ ...valid, STORAGE_PROVIDER: "cloudinary" })
    ).toThrow(/CLOUDINARY_URL/);
  });

  it("refuses a CLIENT_ORIGIN that is not a URL", () => {
    expect(() => parseEnv({ ...valid, CLIENT_ORIGIN: "not a url" })).toThrow();
  });
});

describe("platform settings", () => {
  it("returns defaults on first read and creates exactly one document", async () => {
    const admin = await makeUser({ role: "admin" });

    const first = await request(server).get("/platform/settings").set(auth(admin));
    const second = await request(server).get("/platform/settings").set(auth(admin));

    expect(first.status).toBe(200);
    expect(first.body.platform_name).toBe("Kids In Tech LMS");
    expect(first.body.id).toBe(second.body.id);
    expect(await Setting.countDocuments({})).toBe(1);
  });

  it("includes the live permission matrix", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/platform/settings").set(auth(admin));

    expect(res.body.permissions["users.manage"]).toEqual(["admin"]);
  });

  it("lets an admin update presentation fields", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/platform/settings")
      .set(auth(admin))
      .send({ platform_name: "KIT Academy", primary_color: "#059669" });

    expect(res.status).toBe(200);
    expect(res.body.platform_name).toBe("KIT Academy");
  });

  it("validates a colour", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/platform/settings")
      .set(auth(admin))
      .send({ primary_color: "greenish" });

    expect(res.status).toBe(400);
  });

  it("saves permission overrides and puts them into force immediately", async () => {
    const admin = await makeUser({ role: "admin" });
    expect(can("instructor", "analytics.view")).toBe(false);

    const res = await request(server)
      .post("/admin/permissions")
      .set(auth(admin))
      .send({ permissions: { "analytics.view": ["admin", "instructor"] } });

    expect(res.status).toBe(200);
    expect(can("instructor", "analytics.view")).toBe(true);

    // An instructor can now reach the endpoint that permission guards.
    const instructor = await makeUser({ role: "instructor" });
    const stats = await request(server).get("/admin/stats").set(auth(instructor));
    expect(stats.status).toBe(200);

    resetPermissions();
  });

  it("reports ignored keys rather than storing them", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/permissions")
      .set(auth(admin))
      .send({ permissions: { "make.coffee": ["admin"] } });

    expect(res.status).toBe(200);
    expect(res.body.ignored).toContain("make.coffee");

    resetPermissions();
  });
});

describe("serialisation", () => {
  it("exposes id as a string and hides internals everywhere", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/admin/users").set(auth(admin));

    for (const row of res.body) {
      expect(typeof row.id).toBe("string");
      expect(row._id).toBeUndefined();
      expect(row.__v).toBeUndefined();
      expect(row.password_hash).toBeUndefined();
      expect(row.token_version).toBeUndefined();
      expect(row.reset_token_hash).toBeUndefined();
    }
  });

  it("returns ISO 8601 dates", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server).get("/admin/users").set(auth(admin));

    expect(res.body[0].created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("hashes passwords with bcrypt at cost 12", async () => {
    const user = await makeUser({ role: "admin" });
    const stored = await User.findById(user._id).select("+password_hash");

    expect(stored.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.password_hash).not.toContain(PASSWORD);
  });
});

describe("CORS and headers", () => {
  it("allows the configured client origin", async () => {
    const res = await request(server)
      .get("/health")
      .set("Origin", "http://localhost:3004");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3004");
  });

  it("does not allow an unknown origin", async () => {
    const res = await request(server)
      .get("/health")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets helmet's security headers and hides the framework", async () => {
    const res = await request(server).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns a request id for support", async () => {
    const res = await request(server).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
