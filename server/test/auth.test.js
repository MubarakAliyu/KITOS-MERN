import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app, makeUser, makeFamily, login, auth, PASSWORD, resetState } from "./helpers.js";
import { User } from "../src/models/User.js";
import { ActivityLog } from "../src/models/ActivityLog.js";
import { signTempToken } from "../src/lib/tokens.js";

const server = app();

beforeEach(resetState);

describe("GET /health", () => {
  it("reports the database as up", async () => {
    const res = await request(server).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: "up" });
    expect(res.body.version).toBeTruthy();
  });

  it("needs no authentication", async () => {
    const res = await request(server).get("/health");
    expect(res.status).toBe(200);
  });
});

describe("POST /login", () => {
  it("signs in by email and returns the shape the frontend reads", async () => {
    const user = await makeUser({ role: "admin", email: "admin@kit.test" });

    const res = await login(server, "admin@kit.test");

    expect(res.status).toBe(200);
    // auth-options.js reads `result.access`.
    expect(typeof res.body.access).toBe("string");
    expect(res.body.user).toMatchObject({
      id: String(user._id),
      email: "admin@kit.test",
      role: "admin",
      must_reset_password: false,
    });
    // Never leak the hash.
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("signs in by admission number", async () => {
    const { childUser } = await makeFamily();

    const res = await login(server, childUser.admission_no);

    expect(res.status).toBe(200);
    expect(res.body.user.admission_no).toBe(childUser.admission_no);
    expect(res.body.user.role).toBe("student");
  });

  it("matches an email case-insensitively", async () => {
    await makeUser({ role: "admin", email: "mixed@kit.test" });

    const res = await login(server, "MiXeD@KIT.test");

    expect(res.status).toBe(200);
  });

  it("rejects a wrong password with 401", async () => {
    await makeUser({ role: "admin", email: "admin@kit.test" });

    const res = await request(server)
      .post("/login")
      .send({ email: "admin@kit.test", password: "WrongPass123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
    expect(res.body.access).toBeUndefined();
  });

  it("gives the same answer for an unknown account, so it cannot be used to enumerate users", async () => {
    const unknown = await request(server)
      .post("/login")
      .send({ email: "nobody@kit.test", password: PASSWORD });

    await makeUser({ role: "admin", email: "known@kit.test" });
    const wrongPassword = await request(server)
      .post("/login")
      .send({ email: "known@kit.test", password: "WrongPass123" });

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body.error).toBe(wrongPassword.body.error);
  });

  it("refuses a deactivated account", async () => {
    await makeUser({ role: "admin", email: "off@kit.test", is_active: false });

    const res = await login(server, "off@kit.test");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Account deactivated");
  });

  it("refuses a student whose parent has not consented", async () => {
    const { childUser } = await makeFamily({ consented: false });

    const res = await login(server, childUser.admission_no);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account pending parental consent");
  });

  it("lets the same student in once consent is recorded", async () => {
    const { childUser } = await makeFamily({ consented: true });

    const res = await login(server, childUser.admission_no);

    expect(res.status).toBe(200);
    expect(res.body.access).toBeTruthy();
  });

  it("returns a temp token instead of a session when a reset is forced", async () => {
    await makeUser({
      role: "admin",
      email: "forced@kit.test",
      must_reset_password: true,
    });

    const res = await login(server, "forced@kit.test");

    expect(res.status).toBe(200);
    expect(res.body.must_reset_password).toBe(true);
    expect(res.body.temp_token).toBeTruthy();
    // No usable session until a new password is chosen.
    expect(res.body.access).toBeUndefined();
  });

  it("records the sign-in time", async () => {
    const user = await makeUser({ role: "admin", email: "stamp@kit.test" });
    expect(user.last_login_at).toBeNull();

    await login(server, "stamp@kit.test");

    const reloaded = await User.findById(user._id);
    expect(reloaded.last_login_at).toBeInstanceOf(Date);
  });

  it("audits a burst of failures", async () => {
    await makeUser({ role: "admin", email: "target@kit.test" });

    for (let i = 0; i < 5; i += 1) {
      await request(server)
        .post("/login")
        .send({ email: "target@kit.test", password: "WrongPass123" });
    }

    const burst = await ActivityLog.findOne({ action: "login_failure_burst" });
    expect(burst).not.toBeNull();
    expect(burst.meta.attempts).toBeGreaterThanOrEqual(5);
  });

  it("rejects a body with Mongo operators instead of running them as a query", async () => {
    await makeUser({ role: "admin", email: "safe@kit.test" });

    const res = await request(server)
      .post("/login")
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.access).toBeUndefined();
  });
});

describe("token verification", () => {
  it("rejects an unsigned alg:none token — the legacy API's defect", async () => {
    const admin = await makeUser({ role: "admin" });

    const b64 = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      sub: String(admin._id),
      role: "admin",
      tv: 0,
    })}.`;

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const admin = await makeUser({ role: "admin" });
    const forged = jwt.sign(
      { sub: String(admin._id), role: "admin", tv: 0 },
      "not-the-real-secret-but-long-enough-to-sign",
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it("rejects a token whose payload was edited after signing", async () => {
    const student = await makeUser({ role: "student", admission_no: "KIT/26/777" });
    const token = jwt.sign(
      { sub: String(student._id), role: "student", tv: 0 },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );

    // Swap the payload for an admin one, keeping the original signature.
    const [header, , signature] = token.split(".");
    const tampered = `${header}.${Buffer.from(
      JSON.stringify({ sub: String(student._id), role: "admin", tv: 0 })
    ).toString("base64url")}.${signature}`;

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const admin = await makeUser({ role: "admin" });
    const expired = jwt.sign(
      { sub: String(admin._id), role: "admin", tv: 0 },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-10s" }
    );

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Session expired");
  });

  it("refuses a password-reset token as a credential", async () => {
    const admin = await makeUser({ role: "admin" });
    const temp = signTempToken({ id: admin._id, role: "admin", token_version: 0 });

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${temp}`);

    expect(res.status).toBe(401);
  });

  it("rejects a missing or malformed Authorization header", async () => {
    const none = await request(server).get("/admin/users");
    expect(none.status).toBe(401);

    const wrongScheme = await request(server)
      .get("/admin/users")
      .set("Authorization", "Basic abc123");
    expect(wrongScheme.status).toBe(401);
  });

  it("rejects a token for a user who no longer exists", async () => {
    const admin = await makeUser({ role: "admin" });
    const token = jwt.sign(
      { sub: String(admin._id), role: "admin", tv: 0 },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );
    await User.deleteOne({ _id: admin._id });

    const res = await request(server)
      .get("/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it("stops accepting a token once the account is deactivated", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const headers = auth(instructor);

    const before = await request(server).get("/instructors/me").set(headers);
    expect(before.status).toBe(200);

    await request(server)
      .post("/admin/users/deactivate")
      .set(auth(admin))
      .send({ user_id: String(instructor._id) });

    const after = await request(server).get("/instructors/me").set(headers);
    expect(after.status).toBe(401);
  });

  it("stops accepting a token once the password changes", async () => {
    const user = await makeUser({ role: "instructor" });
    const headers = auth(user);

    expect((await request(server).get("/instructors/me").set(headers)).status).toBe(200);

    await request(server)
      .post("/user/change-password")
      .set(headers)
      .send({ current_password: PASSWORD, new_password: "BrandNew123" });

    const after = await request(server).get("/instructors/me").set(headers);
    expect(after.status).toBe(401);
  });
});

describe("password reset", () => {
  it("always answers 200, so the response cannot reveal who has an account", async () => {
    await makeUser({ role: "parent", email: "real@kit.test" });

    const known = await request(server)
      .post("/forgot-password")
      .send({ email: "real@kit.test" });
    const unknown = await request(server)
      .post("/forgot-password")
      .send({ email: "ghost@kit.test" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("stores only a hash of the reset token", async () => {
    const user = await makeUser({ role: "parent", email: "reset@kit.test" });

    await request(server).post("/forgot-password").send({ email: "reset@kit.test" });

    const reloaded = await User.findById(user._id).select(
      "+reset_token_hash +reset_token_expires_at"
    );
    expect(reloaded.reset_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reloaded.reset_token_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses an unknown reset token", async () => {
    const res = await request(server)
      .post("/reset-password")
      .send({ token: "a".repeat(64), password: "BrandNew123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("enforces the password policy", async () => {
    const res = await request(server)
      .post("/reset-password")
      .send({ token: "a".repeat(64), password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.fields).toBeDefined();
  });

  it("completes a forced reset and clears the flag", async () => {
    const user = await makeUser({
      role: "admin",
      email: "forced@kit.test",
      must_reset_password: true,
    });

    const signIn = await login(server, "forced@kit.test");
    const tempToken = signIn.body.temp_token;

    const reset = await request(server)
      .post("/user/change-password")
      .send({ temp_token: tempToken, new_password: "BrandNew123" });
    expect(reset.status).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.must_reset_password).toBe(false);

    const second = await request(server)
      .post("/login")
      .send({ email: "forced@kit.test", password: "BrandNew123" });
    expect(second.status).toBe(200);
    expect(second.body.access).toBeTruthy();
    expect(second.body.must_reset_password).toBeUndefined();

    // The old password is gone.
    const old = await login(server, "forced@kit.test");
    expect(old.status).toBe(401);
  });

  it("will not let a temp token be used twice", async () => {
    await makeUser({
      role: "admin",
      email: "once@kit.test",
      must_reset_password: true,
    });

    const signIn = await login(server, "once@kit.test");
    const tempToken = signIn.body.temp_token;

    const first = await request(server)
      .post("/user/change-password")
      .send({ temp_token: tempToken, new_password: "BrandNew123" });
    expect(first.status).toBe(200);

    const replay = await request(server)
      .post("/user/change-password")
      .send({ temp_token: tempToken, new_password: "Different123" });
    expect(replay.status).toBe(400);
  });

  it("requires the current password for a normal change", async () => {
    const user = await makeUser({ role: "parent" });

    const wrong = await request(server)
      .post("/user/change-password")
      .set(auth(user))
      .send({ current_password: "NotMyPassword1", new_password: "BrandNew123" });

    expect(wrong.status).toBe(400);
    expect(wrong.body.fields.current_password).toBeTruthy();
  });
});
