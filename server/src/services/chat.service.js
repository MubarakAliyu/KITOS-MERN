import mongoose from "mongoose";
import sanitizeHtml from "sanitize-html";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import { Course } from "../models/Course.js";
import { Enrollment } from "../models/Enrollment.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { avatarInitial } from "../lib/serialize.js";
import {
  emitToConversation,
  emitToUser,
  pushNotification,
} from "../realtime/emit.js";

/**
 * Chat, and the rules about who may talk to whom (PRD §10, FR15).
 *
 * This service is the only place those rules live. The UI hides the controls
 * a role should not have, and that is cosmetic: every path in here checks the
 * pair again, because a hidden button is not a permission.
 */

/** Messages are rendered as text, so no markup survives the write. */
const asPlainText = (value, max) =>
  sanitizeHtml(String(value ?? ""), { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, max);

const MESSAGE_MAX = 4000;

/**
 * The allowed pairs, exactly as PRD §10 lists them.
 *
 * Everything absent from this table is refused. That includes pairs which
 * look harmless — two instructors, two parents, a parent and their own child
 * — and the refusal is deliberate (ADR-030). An allow-list is the only shape
 * of this rule that fails safe: a new role, or a pair nobody thought about,
 * is refused rather than quietly permitted. Staff who need to coordinate have
 * an administrator, who may talk to anyone.
 */
const ALLOWED_PAIRS = [
  ["admin", "admin"],
  ["admin", "instructor"],
  ["admin", "parent"],
  ["admin", "student"],
  ["instructor", "parent"],
  ["instructor", "student"],
];

function pairKey(roleA, roleB) {
  return [roleA, roleB].sort().join("|");
}

const ALLOWED_KEYS = new Set(ALLOWED_PAIRS.map(([a, b]) => pairKey(a, b)));

/**
 * May these two people hold a conversation?
 *
 * Student↔instructor carries one extra condition from PRD §10: they must
 * share a course. A child may message the person teaching them, not every
 * instructor on the platform.
 */
export async function assertPairAllowed(a, b) {
  if (String(a._id) === String(b._id)) {
    throw badRequest("You cannot start a conversation with yourself");
  }

  if (!ALLOWED_KEYS.has(pairKey(a.role, b.role))) {
    // Named explicitly because it is the rule the product exists to enforce.
    if (a.role === "student" && b.role === "student") {
      throw forbidden(
        "Students cannot message each other",
        "Kids In Tech does not allow pupil-to-pupil chat"
      );
    }
    throw forbidden(
      "Those two accounts cannot hold a conversation",
      `A ${a.role} and a ${b.role} are not an allowed pair`
    );
  }

  if (pairKey(a.role, b.role) === pairKey("instructor", "student")) {
    const student = a.role === "student" ? a : b;
    const instructor = a.role === "instructor" ? a : b;
    await assertSharedCourse({ studentUser: student, instructorUser: instructor });
  }
}

/** A child may only message an instructor who teaches a course they are on. */
async function assertSharedCourse({ studentUser, instructorUser }) {
  const student = await Student.findOne({ user_id: studentUser._id }).select("_id");
  if (!student) {
    throw forbidden("That pupil has no learning profile");
  }

  const theirCourses = await Course.find({
    instructor_id: instructorUser._id,
  }).select("_id");

  const shared = await Enrollment.exists({
    student_id: student._id,
    course_id: { $in: theirCourses.map((c) => c._id) },
    status: { $in: ["active", "completed"] },
  });

  if (!shared) {
    throw forbidden(
      "You can only message an instructor who teaches you",
      "There is no shared course between these two accounts"
    );
  }
}

/**
 * The parents who may observe a conversation.
 *
 * A parent sees their child's threads (PRD §10) without being a participant:
 * they can read, and `postMessage` refuses to let them write. Where the
 * parent is already a participant — a parent talking to an instructor — they
 * are not added again as an observer.
 */
async function observersFor(participants) {
  const studentUserIds = participants
    .filter((p) => p.role === "student")
    .map((p) => p._id);

  if (studentUserIds.length === 0) return [];

  const students = await Student.find({
    user_id: { $in: studentUserIds },
  }).select("parent_id");

  const participantIds = new Set(participants.map((p) => String(p._id)));

  return [
    ...new Set(
      students
        .map((s) => String(s.parent_id))
        .filter((id) => id && !participantIds.has(id))
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));
}

async function userOrFail(id, label) {
  if (!mongoose.isValidObjectId(id)) {
    throw badRequest("Validation failed", undefined, {
      [label]: "Must be a valid id",
    });
  }
  const user = await User.findById(id);
  if (!user) throw notFound("That account does not exist");
  return user;
}

/**
 * The pair conversation between two people, created if it is not there.
 *
 * Find-or-create is what makes "start a chat" work at all: the retained UI
 * posts a message with a recipient and no thread id, so the first message is
 * also the thing that opens the thread.
 */
export async function findOrCreateConversation({ user, otherUserId }) {
  const other = await userOrFail(otherUserId, "receiver_id");
  await assertPairAllowed(user, other);

  const ids = [String(user._id), String(other._id)].sort();
  const pairKey = ids.join(":");

  const existing = await Conversation.findOne({ pair_key: pairKey });
  if (existing) return existing;

  const observers = await observersFor([user, other]);

  try {
    return await Conversation.create({
      participant_ids: ids,
      observer_ids: observers,
    });
  } catch (err) {
    // Two first messages at once: the unique index decides, and the loser
    // reads the winner's thread rather than failing the send.
    if (err?.code === 11000) {
      return Conversation.findOne({ pair_key: pairKey });
    }
    throw err;
  }
}

/** Participant, observer or admin. Anything else cannot see the thread. */
function roleInConversation(conversation, user) {
  const id = String(user._id);
  if (conversation.participant_ids.some((p) => String(p) === id)) {
    return "participant";
  }
  if (conversation.observer_ids.some((o) => String(o) === id)) {
    return "observer";
  }
  if (user.role === "admin") return "admin";
  return null;
}

async function conversationOrFail(conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw badRequest("Validation failed", undefined, {
      conversation_id: "Must be a valid id",
    });
  }
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw notFound("Conversation not found");
  return conversation;
}

export async function assertCanRead({ user, conversation }) {
  const role = roleInConversation(conversation, user);
  if (!role) {
    throw forbidden("You do not have permission to read this conversation");
  }
  return role;
}

/**
 * The caller's conversation list, in the shape the chat screens read.
 *
 * `participant_id` is "the other person" from the caller's point of view,
 * which is why this cannot be a plain serializer — the same document renders
 * differently for each side, and differently again for a watching parent.
 */
export async function listConversations({ user }) {
  const id = user._id;

  const rows = await Conversation.find({
    $or: [{ participant_ids: id }, { observer_ids: id }],
  }).sort({ last_message_at: -1, created_at: -1 });

  if (rows.length === 0) return [];

  const everyone = [
    ...new Set(
      rows.flatMap((row) => row.participant_ids.map(String))
    ),
  ];
  const users = await User.find({ _id: { $in: everyone } }).select("name role");
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const viewerId = String(id);

  return rows.map((row) => {
    const participantIds = row.participant_ids.map(String);
    const isObserver = !participantIds.includes(viewerId);

    /**
     * For a participant, the other person. For an observing parent there is
     * no "other": they are watching two people talk, so the thread is
     * labelled with the one who is not their child — the instructor or
     * administrator — which is who the conversation is *with*.
     */
    const otherId = isObserver
      ? participantIds.find((p) => byId.get(p)?.role !== "student") ??
        participantIds[0]
      : participantIds.find((p) => p !== viewerId);

    const other = byId.get(otherId);
    const child = isObserver
      ? byId.get(participantIds.find((p) => byId.get(p)?.role === "student"))
      : null;

    return {
      id: String(row._id),
      participant_id: otherId ?? null,
      participant_name: other?.name ?? "Unknown",
      participant_role: other?.role ?? null,
      participant_initial: avatarInitial(other?.name),
      last_message: row.last_message ?? "",
      last_message_time: row.last_message_at?.toISOString() ?? null,
      unread_count: isObserver ? 0 : row.unread?.get(viewerId) ?? 0,
      // Only present for an observing parent, so the screen can say whose
      // conversation this is.
      observing: isObserver || undefined,
      child_name: child?.name ?? undefined,
      reported: row.reported || undefined,
    };
  });
}

function serializeMessage(row) {
  return {
    id: String(row._id),
    conversation_id: String(row.conversation_id),
    sender_id: String(row.sender_id),
    receiver_id: String(row.receiver_id),
    message: row.message ?? "",
    file_url: row.file_url ?? null,
    file_type: row.file_type ?? null,
    read: row.read,
    created_at: row.created_at?.toISOString() ?? null,
  };
}

/** One thread, oldest first, as the transcript reads. */
export async function listMessages({ user, conversationId }) {
  const conversation = await conversationOrFail(conversationId);
  await assertCanRead({ user, conversation });

  const rows = await Message.find({ conversation_id: conversation._id })
    .sort({ created_at: 1 })
    .limit(500);

  return rows.map(serializeMessage);
}

/**
 * Sends a message.
 *
 * Takes either a `conversation_id` or a `receiver_id`: the UI sends both once
 * a thread is open and only the recipient when starting one.
 *
 * `sender_id` arrives in the body because the mock handlers were written that
 * way. It is ignored — the sender is whoever holds the token. Trusting it
 * would let anyone post as anyone.
 */
export async function postMessage({ user, payload }) {
  let conversation = null;

  if (payload.conversation_id) {
    conversation = await conversationOrFail(payload.conversation_id);
  } else if (payload.receiver_id) {
    conversation = await findOrCreateConversation({
      user,
      otherUserId: payload.receiver_id,
    });
  } else {
    throw badRequest("Validation failed", undefined, {
      conversation_id: "A conversation or a recipient is required",
    });
  }

  const role = roleInConversation(conversation, user);

  if (role === "observer") {
    throw forbidden(
      "You can read this conversation but not write in it",
      "A parent observes their child's conversations"
    );
  }
  if (role !== "participant") {
    // An administrator reads every thread and still does not get to post
    // into one between two other people as though they were in it.
    throw forbidden("You are not a participant in this conversation");
  }

  // The pair is re-checked on every send, not only when the thread was
  // opened: a pupil can be unenrolled from a course, and the thread must
  // close with it.
  const participantIds = conversation.participant_ids.map(String);
  const otherId = participantIds.find((p) => p !== String(user._id));
  const other = await userOrFail(otherId, "receiver_id");
  await assertPairAllowed(user, other);

  const text = asPlainText(payload.message, MESSAGE_MAX);
  const fileUrl = payload.file_url ? asPlainText(payload.file_url, 500) : null;

  if (!text && !fileUrl) {
    throw badRequest("Validation failed", undefined, {
      message: "Write something, or attach a file",
    });
  }

  const message = await Message.create({
    conversation_id: conversation._id,
    sender_id: user._id,
    receiver_id: other._id,
    message: text,
    file_url: fileUrl,
    file_type: payload.file_type ? asPlainText(payload.file_type, 60) : null,
  });

  // The conversation list reads these rather than the messages collection.
  const preview = text || (message.file_type ? "Attachment" : "");
  conversation.last_message = preview.slice(0, 200);
  conversation.last_message_at = message.created_at ?? new Date();
  conversation.last_sender_id = user._id;

  const unread = conversation.unread ?? new Map();
  unread.set(String(other._id), (unread.get(String(other._id)) ?? 0) + 1);
  conversation.unread = unread;
  await conversation.save();

  const serialized = serializeMessage(message);

  // Everyone watching the thread sees it at once; the recipient's other tabs
  // get it too, because they may have the list open rather than the thread.
  emitToConversation(conversation._id, "message", serialized);
  emitToUser(other._id, "message", serialized);

  await notifyRecipient({ conversation, message, sender: user, recipient: other });

  return serialized;
}

/**
 * Tells the recipient, unless they are already reading.
 *
 * Observers are deliberately not notified per message: a parent watching two
 * threads would otherwise get a notification for every line their child
 * types, and the point is oversight, not a running commentary.
 */
async function notifyRecipient({ conversation, message, sender, recipient }) {
  const notification = await Notification.create({
    user_id: recipient._id,
    type: "new_message",
    title: `New message from ${sender.name}`,
    message: (message.message || "Attachment").slice(0, 140),
    link: `/${recipient.role}/chat`,
  });

  pushNotification({
    id: String(notification._id),
    user_id: String(recipient._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    is_read: false,
    created_at: notification.created_at?.toISOString() ?? null,
    conversation_id: String(conversation._id),
  });
}

/** Marks the caller's side of a thread read. */
export async function markConversationRead({ user, conversationId }) {
  const conversation = await conversationOrFail(conversationId);
  const role = await assertCanRead({ user, conversation });

  // An observer reading a thread does not clear the participant's badge.
  if (role !== "participant") return { success: true, updated: 0 };

  const result = await Message.updateMany(
    { conversation_id: conversation._id, receiver_id: user._id, read: false },
    { $set: { read: true, read_at: new Date() } }
  );

  const unread = conversation.unread ?? new Map();
  unread.set(String(user._id), 0);
  conversation.unread = unread;
  await conversation.save();

  return { success: true, updated: result.modifiedCount ?? 0 };
}

/**
 * Reports a thread for an administrator to look at (PRD §10).
 *
 * Nothing is hidden or deleted. An administrator can already read every
 * conversation; this flags one as needing attention and tells them so.
 */
export async function reportConversation({ user, conversationId, reason }) {
  const conversation = await conversationOrFail(conversationId);
  await assertCanRead({ user, conversation });

  conversation.reported = true;
  conversation.reported_by = user._id;
  conversation.reported_at = new Date();
  conversation.reported_reason = reason ? asPlainText(reason, 500) : null;
  await conversation.save();

  const admins = await User.find({ role: "admin", is_active: true }).select("_id");

  for (const admin of admins) {
    const notification = await Notification.create({
      user_id: admin._id,
      type: "chat_reported",
      title: "A conversation was reported",
      message: `${user.name} reported a conversation for review`,
      link: "/admin/chat",
    });
    pushNotification({
      id: String(notification._id),
      user_id: String(admin._id),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      is_read: false,
      created_at: notification.created_at?.toISOString() ?? null,
    });
  }

  return { success: true, reported: true };
}

/**
 * Every conversation on the platform, for the admin monitor
 * (`/admin/chat/all-conversations`).
 *
 * Participants are returned as names, which is what the screen shows. The
 * monitor exists so a safeguarding concern can be acted on, so a reported
 * thread sorts to the top regardless of when it was last active.
 */
export async function listAllConversations() {
  const rows = await Conversation.find({}).sort({ last_message_at: -1 }).limit(200);
  if (rows.length === 0) return [];

  const everyone = [
    ...new Set(rows.flatMap((row) => row.participant_ids.map(String))),
  ];
  const users = await User.find({ _id: { $in: everyone } }).select("name role");
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const counts = await Message.aggregate([
    { $match: { conversation_id: { $in: rows.map((r) => r._id) } } },
    {
      $group: {
        _id: "$conversation_id",
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] } },
      },
    },
  ]);
  const countsById = new Map(counts.map((c) => [String(c._id), c]));

  const serialized = rows.map((row) => {
    const tally = countsById.get(String(row._id));
    const participants = row.participant_ids.map(
      (p) => byId.get(String(p))?.name ?? "Unknown"
    );
    const roles = row.participant_ids.map(
      (p) => byId.get(String(p))?.role ?? null
    );

    return {
      conv_id: String(row._id),
      participants,
      roles,
      last_message: row.last_message ?? "",
      last_message_time: row.last_message_at?.toISOString() ?? null,
      message_count: tally?.total ?? 0,
      unread_count: tally?.unread ?? 0,
      reported: row.reported,
      reported_reason: row.reported_reason ?? null,
    };
  });

  // Reported threads first: this screen is a safeguarding tool.
  return serialized.sort((a, b) => {
    if (a.reported !== b.reported) return a.reported ? -1 : 1;
    return new Date(b.last_message_time ?? 0) - new Date(a.last_message_time ?? 0);
  });
}

/**
 * Who the caller is allowed to start a conversation with.
 *
 * The retained UI has no "new chat" picker, so this is not wired to a screen;
 * it exists because the rules are only testable end to end if something can
 * enumerate them, and it is the honest place to answer "who can I talk to?"
 * without the client guessing.
 */
export async function listContactable({ user }) {
  const roles = [...ALLOWED_KEYS]
    .map((key) => key.split("|"))
    .filter(([a, b]) => a === user.role || b === user.role)
    .map(([a, b]) => (a === user.role ? b : a));

  const candidates = await User.find({
    role: { $in: [...new Set(roles)] },
    is_active: true,
    _id: { $ne: user._id },
  }).select("name role");

  const allowed = [];
  for (const candidate of candidates) {
    try {
      await assertPairAllowed(user, candidate);
      allowed.push({
        id: String(candidate._id),
        name: candidate.name,
        role: candidate.role,
        initial: avatarInitial(candidate.name),
      });
    } catch {
      // Not an allowed pair for this particular person — the shared-course
      // rule is per-pupil, so this is expected and not an error.
    }
  }
  return allowed;
}

export { ALLOWED_PAIRS };
