import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import http from "node:http";
import { io as ioClient } from "socket.io-client";
import { app, makeUser, makeFamily, auth, tokenFor, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { Conversation } from "../src/models/Conversation.js";
import { Message } from "../src/models/Message.js";
import { Notification } from "../src/models/Notification.js";
import { Announcement } from "../src/models/Announcement.js";
import { Student } from "../src/models/Student.js";
import { attachRealtime, detachRealtime } from "../src/realtime/socket.js";
import { clearRealtime } from "../src/realtime/emit.js";

let server;

beforeEach(async () => {
  await resetState();
  server = app();
});

/**
 * A published course taught by `instructor`, with `student` enrolled.
 *
 * The student↔instructor rule turns on a shared course, so almost every test
 * here needs one of these or needs deliberately not to have one.
 */
async function shareCourse(instructor, student) {
  const course = await Course.create({
    title: `Course ${Math.random().toString(36).slice(2, 8)}`,
    programme_track: "scratch",
    instructor_id: instructor._id,
    status: "published",
  });
  await Enrollment.create({
    student_id: student._id,
    course_id: course._id,
    status: "active",
  });
  return course;
}

const send = (sender, body) =>
  request(server).post("/messages").set(auth(sender)).send(body);

// ── The pair rules (PRD §10) ────────────────────────────────────────────────

describe("who may talk to whom", () => {
  it("refuses one pupil messaging another, which is the rule the product exists for", async () => {
    const a = await makeFamily();
    const b = await makeFamily({ childOverrides: { name: "Other Child" } });

    const res = await send(a.childUser, {
      receiver_id: String(b.childUser._id),
      message: "hello",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot message each other/i);
    expect(await Message.countDocuments({})).toBe(0);
    expect(await Conversation.countDocuments({})).toBe(0);
  });

  it("lets a pupil message an instructor who teaches them", async () => {
    const { childUser, student } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    await shareCourse(instructor, student);

    const res = await send(childUser, {
      receiver_id: String(instructor._id),
      message: "When is the quiz?",
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("When is the quiz?");
    expect(res.body.sender_id).toBe(String(childUser._id));
    expect(res.body.receiver_id).toBe(String(instructor._id));
  });

  it("refuses a pupil messaging an instructor who does not teach them", async () => {
    const { childUser } = await makeFamily();
    const stranger = await makeUser({ role: "instructor" });

    const res = await send(childUser, {
      receiver_id: String(stranger._id),
      message: "hello",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only message an instructor who teaches you/i);
  });

  it("allows parent↔instructor, parent↔admin and admin↔anyone", async () => {
    const { parent, childUser } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    const admin = await makeUser({ role: "admin" });

    const allowed = [
      [parent, instructor],
      [parent, admin],
      [admin, childUser],
      [admin, instructor],
    ];

    for (const [from, to] of allowed) {
      const res = await send(from, {
        receiver_id: String(to._id),
        message: "hello",
      });
      expect(res.status, `${from.role} → ${to.role}`).toBe(201);
    }
  });

  /**
   * The allow-list refuses pairs nobody asked about, and that is the point:
   * a new role or an unconsidered combination fails safe (ADR-030).
   */
  it("refuses pairs the rule does not name, including two instructors and two parents", async () => {
    const instructorA = await makeUser({ role: "instructor" });
    const instructorB = await makeUser({ role: "instructor" });
    const parentA = await makeUser({ role: "parent" });
    const parentB = await makeUser({ role: "parent" });

    for (const [from, to] of [
      [instructorA, instructorB],
      [parentA, parentB],
    ]) {
      const res = await send(from, {
        receiver_id: String(to._id),
        message: "hello",
      });
      expect(res.status, `${from.role} → ${to.role}`).toBe(403);
      expect(res.body.reason).toMatch(/not an allowed pair/i);
    }
  });

  it("refuses a conversation with yourself", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await send(admin, {
      receiver_id: String(admin._id),
      message: "hello",
    });

    expect(res.status).toBe(400);
  });

  it("closes the thread when the shared course goes away", async () => {
    const { childUser, student } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    const course = await shareCourse(instructor, student);

    const opened = await send(childUser, {
      receiver_id: String(instructor._id),
      message: "first",
    });
    expect(opened.status).toBe(201);

    // Unenrolled: the pair is re-checked on every send, not only when the
    // thread was opened.
    await Enrollment.deleteMany({ course_id: course._id });

    const after = await send(childUser, {
      conversation_id: opened.body.conversation_id,
      message: "second",
    });
    expect(after.status).toBe(403);
  });

  it("tells a pupil who they may message", async () => {
    const { childUser, student } = await makeFamily();
    const theirs = await makeUser({ role: "instructor", name: "Their Teacher" });
    await makeUser({ role: "instructor", name: "Someone Else" });
    await makeUser({ role: "admin", name: "An Admin" });
    await shareCourse(theirs, student);

    const res = await request(server).get("/chat/contacts").set(auth(childUser));

    expect(res.status).toBe(200);
    const names = res.body.map((c) => c.name);
    expect(names).toContain("Their Teacher");
    expect(names).toContain("An Admin");
    expect(names).not.toContain("Someone Else");
  });
});

// ── Parents observe their child's threads ───────────────────────────────────

describe("a parent observing their child", () => {
  async function threadWithObserver() {
    const family = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    await shareCourse(instructor, family.student);

    const res = await send(family.childUser, {
      receiver_id: String(instructor._id),
      message: "Hello Miss",
    });
    expect(res.status).toBe(201);

    return { ...family, instructor, conversationId: res.body.conversation_id };
  }

  it("is added as an observer and can read the thread", async () => {
    const { parent, conversationId } = await threadWithObserver();

    const conversation = await Conversation.findById(conversationId);
    expect(conversation.observer_ids.map(String)).toContain(String(parent._id));

    const res = await request(server)
      .get(`/messages?conversation_id=${conversationId}`)
      .set(auth(parent));

    expect(res.status).toBe(200);
    expect(res.body[0].message).toBe("Hello Miss");
  });

  it("sees it in their list, labelled with the child's name", async () => {
    const { parent, student } = await threadWithObserver();

    const res = await request(server).get("/conversations").set(auth(parent));

    expect(res.status).toBe(200);
    const observed = res.body.find((c) => c.observing);
    expect(observed).toBeTruthy();
    expect(observed.child_name).toBe((await Student.findById(student._id)).name);
    expect(observed.participant_role).toBe("instructor");
  });

  it("cannot post in it", async () => {
    const { parent, conversationId } = await threadWithObserver();

    const res = await send(parent, {
      conversation_id: conversationId,
      message: "Speaking for my child",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read this conversation but not write/i);
  });

  it("reading it does not clear the child's unread badge", async () => {
    const { parent, childUser, instructor, conversationId } =
      await threadWithObserver();

    await send(instructor, { conversation_id: conversationId, message: "Reply" });

    await request(server)
      .put("/messages/read")
      .set(auth(parent))
      .send({ conversation_id: conversationId });

    const list = await request(server).get("/conversations").set(auth(childUser));
    expect(list.body[0].unread_count).toBe(1);
  });
});

// ── Reading, unread counts and the admin monitor ────────────────────────────

describe("reading a thread", () => {
  async function pairThread() {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });
    const res = await send(parent, {
      receiver_id: String(admin._id),
      message: "Question",
    });
    return { parent, admin, conversationId: res.body.conversation_id };
  }

  it("counts unread for the recipient only, and clears on read", async () => {
    const { parent, admin, conversationId } = await pairThread();

    let adminList = await request(server).get("/conversations").set(auth(admin));
    expect(adminList.body[0].unread_count).toBe(1);

    const senderList = await request(server)
      .get("/conversations")
      .set(auth(parent));
    expect(senderList.body[0].unread_count).toBe(0);

    const read = await request(server)
      .put("/messages/read")
      .set(auth(admin))
      .send({ conversation_id: conversationId });
    expect(read.status).toBe(200);
    expect(read.body.updated).toBe(1);

    adminList = await request(server).get("/conversations").set(auth(admin));
    expect(adminList.body[0].unread_count).toBe(0);
  });

  it("refuses a stranger reading someone else's thread", async () => {
    const { conversationId } = await pairThread();
    const outsider = await makeUser({ role: "instructor" });

    const res = await request(server)
      .get(`/messages?conversation_id=${conversationId}`)
      .set(auth(outsider));

    expect(res.status).toBe(403);
  });

  it("opens one thread per pair, however many first messages race", async () => {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        send(parent, { receiver_id: String(admin._id), message: `m${i}` })
      )
    );

    for (const res of results) expect(res.status).toBe(201);
    expect(await Conversation.countDocuments({})).toBe(1);
    expect(await Message.countDocuments({})).toBe(4);
  });

  it("refuses an empty message with no attachment", async () => {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });

    const res = await send(parent, {
      receiver_id: String(admin._id),
      message: "   ",
    });

    expect(res.status).toBe(400);
  });

  it("ignores a forged sender_id in the body", async () => {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });

    const res = await send(parent, {
      receiver_id: String(admin._id),
      sender_id: String(instructor._id),
      message: "Not from me",
    });

    expect(res.status).toBe(201);
    // The token decides who sent it, never the body.
    expect(res.body.sender_id).toBe(String(parent._id));
  });

  it("strips markup, because a message is rendered as text", async () => {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });

    const res = await send(parent, {
      receiver_id: String(admin._id),
      message: "<script>alert(1)</script>Hello",
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Hello");
  });
});

describe("the admin chat monitor", () => {
  it("lists every conversation, reported ones first", async () => {
    const parent = await makeUser({ role: "parent" });
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });

    const quiet = await send(parent, {
      receiver_id: String(admin._id),
      message: "Quiet thread",
    });
    const loud = await send(parent, {
      receiver_id: String(instructor._id),
      message: "Thread to report",
    });

    await request(server)
      .post("/chat/report")
      .set(auth(parent))
      .send({ conversation_id: loud.body.conversation_id, reason: "Unkind" });

    const res = await request(server)
      .get("/admin/chat/all-conversations")
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // The monitor is a safeguarding tool, so a report sorts to the top
    // however old the thread is.
    expect(res.body[0].conv_id).toBe(loud.body.conversation_id);
    expect(res.body[0].reported).toBe(true);
    expect(res.body[0].reported_reason).toBe("Unkind");
    expect(res.body[0].message_count).toBe(1);
    expect(res.body.map((r) => r.conv_id)).toContain(quiet.body.conversation_id);
  });

  it("is refused to everyone but an admin", async () => {
    const instructor = await makeUser({ role: "instructor" });

    const res = await request(server)
      .get("/admin/chat/all-conversations")
      .set(auth(instructor));

    expect(res.status).toBe(403);
  });

  it("notifies every administrator when a thread is reported", async () => {
    const parent = await makeUser({ role: "parent" });
    const adminA = await makeUser({ role: "admin" });
    await makeUser({ role: "admin" });

    const thread = await send(parent, {
      receiver_id: String(adminA._id),
      message: "hello",
    });
    await Notification.deleteMany({});

    const res = await request(server)
      .post("/chat/report")
      .set(auth(parent))
      .send({ conversation_id: thread.body.conversation_id });

    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ type: "chat_reported" })).toBe(2);
  });

  it("does not let an admin post into a thread between two other people", async () => {
    const { childUser, student } = await makeFamily();
    const instructor = await makeUser({ role: "instructor" });
    const admin = await makeUser({ role: "admin" });
    await shareCourse(instructor, student);

    const thread = await send(childUser, {
      receiver_id: String(instructor._id),
      message: "hello",
    });

    const res = await send(admin, {
      conversation_id: thread.body.conversation_id,
      message: "Speaking as the pupil",
    });

    // An administrator reads everything and still does not get to appear
    // inside someone else's conversation.
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a participant/i);
  });
});

// ── Notifications and announcements ─────────────────────────────────────────

describe("notifications", () => {
  it("tells the recipient about a new message", async () => {
    const parent = await makeUser({ role: "parent", name: "Mrs Hassan" });
    const admin = await makeUser({ role: "admin" });

    await send(parent, { receiver_id: String(admin._id), message: "Question" });

    const notification = await Notification.findOne({ user_id: admin._id });
    expect(notification.type).toBe("new_message");
    expect(notification.title).toMatch(/Mrs Hassan/);
  });

  it("marks one read, and refuses someone else's", async () => {
    const owner = await makeUser({ role: "parent" });
    const other = await makeUser({ role: "parent" });
    const row = await Notification.create({
      user_id: owner._id,
      type: "system",
      title: "Yours",
    });

    const refused = await request(server)
      .put(`/notifications/${row._id}/read`)
      .set(auth(other));
    expect(refused.status).toBe(403);

    const ok = await request(server)
      .put(`/notifications/${row._id}/read`)
      .set(auth(owner));
    expect(ok.status).toBe(200);
    expect((await Notification.findById(row._id)).is_read).toBe(true);
  });
});

describe("announcements", () => {
  it("reaches everyone and records what was sent", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "instructor" });
    await makeFamily();

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(admin))
      .send({ title: "Half term", message: "No classes next week" });

    expect(res.status).toBe(200);
    // Admin, instructor, parent and child: everyone active.
    expect(res.body.delivered).toBe(4);

    const announcement = await Announcement.findById(res.body.announcement_id);
    expect(announcement.audience).toBe("all");
    expect(announcement.recipient_count).toBe(4);
    expect(String(announcement.sent_by)).toBe(String(admin._id));
  });

  it("targets one role", async () => {
    const admin = await makeUser({ role: "admin" });
    await makeUser({ role: "instructor" });
    const family = await makeFamily();

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(admin))
      .send({ title: "Parents evening", audience: "role", target: "parent" });

    expect(res.body.delivered).toBe(1);
    expect(
      await Notification.countDocuments({ user_id: family.parent._id })
    ).toBe(1);
  });

  /**
   * A course audience has to include the parents. "Tomorrow's class is
   * cancelled" is acted on by the adult, so reaching only the pupils would
   * make the feature useless.
   */
  it("reaches a course's pupils, their parents and its instructor", async () => {
    const admin = await makeUser({ role: "admin" });
    const instructor = await makeUser({ role: "instructor" });
    const enrolled = await makeFamily();
    const notEnrolled = await makeFamily({
      childOverrides: { name: "Elsewhere Child" },
    });
    const course = await shareCourse(instructor, enrolled.student);

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(admin))
      .send({
        title: "Class cancelled",
        audience: "course",
        course_id: String(course._id),
      });

    expect(res.status).toBe(200);
    // The pupil, their parent, and the instructor.
    expect(res.body.delivered).toBe(3);

    for (const id of [enrolled.childUser._id, enrolled.parent._id, instructor._id]) {
      expect(await Notification.countDocuments({ user_id: id })).toBe(1);
    }
    for (const id of [notEnrolled.childUser._id, notEnrolled.parent._id]) {
      expect(await Notification.countDocuments({ user_id: id })).toBe(0);
    }
  });

  it("refuses a course audience with no course", async () => {
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(admin))
      .send({ title: "Oops", audience: "course" });

    expect(res.status).toBe(400);
  });

  /**
   * The fan-out writes in batches of 500. One `insertMany` of several
   * thousand documents is a single enormous command that can exceed the
   * 16 MB limit, so this proves the batching path works rather than that one
   * big write happens to fit.
   */
  it("fans out past one batch", async () => {
    const admin = await makeUser({ role: "admin" });
    const hash = (await makeUser({ role: "parent" })).password_hash;

    // 520 extra accounts, inserted directly: going through makeUser would
    // hash 520 passwords and take minutes.
    const { User } = await import("../src/models/User.js");
    await User.insertMany(
      Array.from({ length: 520 }, (_, i) => ({
        role: "parent",
        name: `Bulk Parent ${i}`,
        email: `bulk${i}@example.test`,
        password_hash: hash,
        is_active: true,
      }))
    );

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(admin))
      .send({ title: "Everyone", audience: "role", target: "parent" });

    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(521);
    expect(await Notification.countDocuments({})).toBe(521);
  }, 60000);

  it("lets a non-admin notify only administrators, whatever audience they ask for", async () => {
    const { childUser } = await makeFamily();
    const admin = await makeUser({ role: "admin" });
    const otherParent = await makeUser({ role: "parent" });

    const res = await request(server)
      .post("/admin/notifications/send")
      .set(auth(childUser))
      .send({ title: "Spam", audience: "role", target: "parent" });

    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ user_id: admin._id })).toBe(1);
    expect(
      await Notification.countDocuments({ user_id: otherParent._id })
    ).toBe(0);
    // Not an announcement, because it was not one.
    expect(await Announcement.countDocuments({})).toBe(0);
  });
});

// ── The socket handshake ────────────────────────────────────────────────────

describe("the socket handshake", () => {
  let httpServer;
  let io;
  let url;

  beforeEach(async () => {
    httpServer = http.createServer(app());
    io = attachRealtime(httpServer);
    await new Promise((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${httpServer.address().port}`;
  });

  afterEach(async () => {
    await detachRealtime(io);
    clearRealtime();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  /** Connects and resolves with `true`, or rejects with the refusal. */
  function connect(token) {
    return new Promise((resolve, reject) => {
      const socket = ioClient(url, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
        timeout: 4000,
      });
      socket.on("connect", () => {
        socket.disconnect();
        resolve(true);
      });
      socket.on("connect_error", (err) => {
        socket.close();
        reject(err);
      });
    });
  }

  it("accepts a valid token", async () => {
    const user = await makeUser({ role: "parent" });
    await expect(connect(tokenFor(user))).resolves.toBe(true);
  });

  it("refuses no token at all", async () => {
    await expect(connect(undefined)).rejects.toThrow(/not authorised/i);
  });

  it("refuses a forged token", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEiLCJyb2xlIjoiYWRtaW4iLCJ0diI6MH0." +
      "not-a-real-signature";
    await expect(connect(forged)).rejects.toThrow(/not authorised/i);
  });

  /**
   * The same revocation REST enforces. A socket outlives the request that
   * opened it, so a token version that no longer matches must not get one.
   */
  it("refuses a token whose version has been revoked", async () => {
    const user = await makeUser({ role: "parent" });
    const token = tokenFor(user);

    user.token_version = (user.token_version ?? 0) + 1;
    await user.save();

    await expect(connect(token)).rejects.toThrow(/not authorised/i);
  });

  it("refuses a deactivated account", async () => {
    const user = await makeUser({ role: "parent" });
    const token = tokenFor(user);

    user.is_active = false;
    await user.save();

    await expect(connect(token)).rejects.toThrow(/not authorised/i);
  });
});
