import * as chatService from "../services/chat.service.js";
import { clientIp, logActivity } from "../lib/audit.js";

/**
 * Batch 3 controllers: chat and the admin chat monitor.
 *
 * Same contract as the earlier batches — unpack the request, call one
 * service, send the response. Every rule about who may talk to whom lives in
 * `chat.service.js`.
 */

const handle = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const actorOf = (req) =>
  req.user
    ? { id: String(req.user._id), role: req.user.role, name: req.user.name }
    : null;

// ── Conversations and messages ──────────────────────────────────────────────

export const getConversations = handle(async (req, res) => {
  res.status(200).json(await chatService.listConversations({ user: req.user }));
});

export const getMessages = handle(async (req, res) => {
  res.status(200).json(
    await chatService.listMessages({
      user: req.user,
      conversationId: req.query.conversation_id,
    })
  );
});

export const postMessage = handle(async (req, res) => {
  const message = await chatService.postMessage({
    user: req.user,
    payload: req.body,
  });
  res.status(201).json(message);
});

export const putMessagesRead = handle(async (req, res) => {
  res.status(200).json(
    await chatService.markConversationRead({
      user: req.user,
      conversationId: req.body.conversation_id,
    })
  );
});

export const getContactable = handle(async (req, res) => {
  res.status(200).json(await chatService.listContactable({ user: req.user }));
});

export const postReportConversation = handle(async (req, res) => {
  const result = await chatService.reportConversation({
    user: req.user,
    conversationId: req.body.conversation_id,
    reason: req.body.reason,
  });

  await logActivity({
    actor: actorOf(req),
    action: "reported_conversation",
    description: "Reported a conversation for review",
    target_type: "conversation",
    target_id: req.body.conversation_id,
    ip: clientIp(req),
  });

  res.status(200).json(result);
});

/** The admin chat monitor: every conversation on the platform. */
export const getAllConversations = handle(async (_req, res) => {
  res.status(200).json(await chatService.listAllConversations());
});
