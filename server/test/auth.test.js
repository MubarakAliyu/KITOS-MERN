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
      .send({
        temp_token: tempToken,
        current_password: PASSWORD,
        new_password: "BrandNew123",
      });
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
      .send({
        temp_token: tempToken,
        current_password: PASSWORD,
        new_password: "BrandNew123",
      });
    expect(first.status).toBe(200);

    const replay = await request(server)
      .post("/user/change-password")
      .send({
        temp_token: tempToken,
        current_password: PASSWORD,
        new_password: "Different123",
      });
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

/**
 * The forced first-login change (production fix).
 *
 * On the live site this flow could not be completed at all. The client's
 * NextAuth session for a must-change account carried the temp token as its
 * `accessToken`, so the axios interceptor attached it as a Bearer credential;
 * the route branched on the Authorization header being present, `authenticate`
 * correctly refused a reset-purpose token, and the request answered 401 before
 * the service — which handles temp tokens perfectly well — was ever reached.
 *
 * A user given a temporary password therefore could not set a password, and
 * because the temporary one still forced a reset, could not sign in either.
 * Both instructor accounts were in that state.
 */
describe("forced first-login password change", () => {
  async function forcedAccount(email = "forced.flow@kit.test") {
    await makeUser({ role: "instructor", email, must_reset_password: true });
    const signIn = await login(server, email);
    expect(signIn.status).toBe(200);
    return { email, tempToken: signIn.body.temp_token };
  }

  /**
   * The regression itself: the request still carries the temp token in the
   * Authorization header, as a browser holding a stale session would.
   *
   * The body is what decides which flow this is. Were the route to go back to
   * branching on the header, this is the test that fails.
   */
  it("succeeds even when the temp token is also sent as a Bearer token", async () => {
    const { email, tempToken } = await forcedAccount();

    const res = await request(server)
      .post("/user/change-password")
      .set("Authorization", `Bearer ${tempToken}`)
      .send({
        temp_token: tempToken,
        current_password: PASSWORD,
        new_password: "ChosenByMe123",
      });

    expect(res.status).toBe(200);

    const after = await request(server)
      .post("/login")
      .send({ email, password: "ChosenByMe123" });
    expect(after.status).toBe(200);
    expect(after.body.access).toBeTruthy();
    expect(after.body.must_reset_password).toBeUndefined();
  });

  it("requires the temporary password", async () => {
    const { tempToken } = await forcedAccount("needs.current@kit.test");

    const res = await request(server)
      .post("/user/change-password")
      .send({ temp_token: tempToken, new_password: "ChosenByMe123" });

    expect(res.status).toBe(400);
    expect(res.body.fields.current_password).toBeTruthy();
  });

  it("refuses the wrong temporary password, and changes nothing", async () => {
    const { email, tempToken } = await forcedAccount("wrong.current@kit.test");

    const res = await request(server)
      .post("/user/change-password")
      .send({
        temp_token: tempToken,
        current_password: "NotThePassword1",
        new_password: "ChosenByMe123",
      });

    expect(res.status).toBe(400);
    expect(res.body.fields.current_password).toBeTruthy();

    // The attempt is audited, and the account is untouched: the temporary
    // password still works and still forces a change.
    const entry = await ActivityLog.findOne({
      action: "password_change_failed",
    });
    expect(entry).toBeTruthy();

    const stillForced = await login(server, email);
    expect(stillForced.body.must_reset_password).toBe(true);
  });

  it("clears the flag and ends the sessions the account had", async () => {
    const email = "clears.flag@kit.test";
    const user = await makeUser({
      role: "instructor",
      email,
      must_reset_password: true,
    });
    const before = await User.findById(user._id).select("+token_version");
    const signIn = await login(server, email);

    const res = await request(server).post("/user/change-password").send({
      temp_token: signIn.body.temp_token,
      current_password: PASSWORD,
      new_password: "ChosenByMe123",
    });
    expect(res.status).toBe(200);

    const after = await User.findById(user._id).select("+token_version");
    expect(after.must_reset_password).toBe(false);
    expect(after.token_version).toBeGreaterThan(before.token_version ?? 0);
  });

  /**
   * The whole round trip an administrator and a new instructor actually make,
   * in one test, because every individual step passed while the flow as a
   * whole did not.
   */
  it("takes an account from admin-created to signed in with its own password", async () => {
    const admin = await makeUser({ role: "admin" });

    const created = await request(server)
      .post("/admin/users")
      .set(auth(admin))
      .send({
        name: "Fatima Sani",
        role: "instructor",
        email: "fatima.sani@kit.test",
        bio: null,
      });
    expect(created.status).toBe(201);
    const temporary = created.body.temporary_password;
    expect(temporary).toBeTruthy();

    const first = await request(server)
      .post("/login")
      .send({ email: "fatima.sani@kit.test", password: temporary });
    expect(first.status).toBe(200);
    expect(first.body.must_reset_password).toBe(true);
    expect(first.body.access).toBeUndefined();

    const changed = await request(server).post("/user/change-password").send({
      temp_token: first.body.temp_token,
      current_password: temporary,
      new_password: "FatimaOwn123",
    });
    expect(changed.status).toBe(200);

    const second = await request(server)
      .post("/login")
      .send({ email: "fatima.sani@kit.test", password: "FatimaOwn123" });
    expect(second.status).toBe(200);
    expect(second.body.access).toBeTruthy();
    expect(second.body.user.role).toBe("instructor");

    // And the temporary password is spent.
    const stale = await request(server)
      .post("/login")
      .send({ email: "fatima.sani@kit.test", password: temporary });
    expect(stale.status).toBe(401);
  });

  /** The same contract on the public route, which shares the service. */
  it("requires the temporary password on /reset-password too", async () => {
    const { tempToken } = await forcedAccount("public.route@kit.test");

    const bare = await request(server)
      .post("/reset-password")
      .send({ temp_token: tempToken, new_password: "ChosenByMe123" });
    expect(bare.status).toBe(400);

    const withIt = await request(server).post("/reset-password").send({
      temp_token: tempToken,
      current_password: PASSWORD,
      new_password: "ChosenByMe123",
    });
    expect(withIt.status).toBe(200);
  });
});

/**
 * The password-change rate limit, keyed per credential rather than per IP.
 *
 * Written because the E2E suite kept hitting 429 from one address, which is
 * the same shape as the real problem: a KIT centre is one shared connection,
 * so per-IP meant ten password changes an hour for the entire school.
 *
 * The limiter is skipped under NODE_ENV=test, so these build their own app
 * with it live — see `test/rate-limit.test.js` for the same pattern.
 */
describe("the password-change rate limit", () => {
  it("counts attempts against the credential, not the address", async () => {
    const { passwordChangeKey } = await import(
      "../src/middleware/rateLimit.js"
    );

    const key = (body, authorization) =>
      passwordChangeKey({ ip: "102.89.0.1", body, headers: { authorization } });

    const first = key({ temp_token: "token-one" });
    const second = key({ temp_token: "token-two" });
    const sameAgain = key({ temp_token: "token-one" });

    // Two accounts behind one address get their own budgets.
    expect(first).not.toBe(second);
    // The same credential keeps its own, so the limit still bites.
    expect(first).toBe(sameAgain);

    // A signed-in change is scoped to its session's bearer token.
    expect(key({}, "Bearer aaa")).not.toBe(key({}, "Bearer bbb"));

    // The credential itself never appears in the key.
    expect(first).not.toContain("token-one");

    // And a request carrying nothing still gets a key, scoped to the address.
    expect(key({})).toContain("anonymous");
  });
});
