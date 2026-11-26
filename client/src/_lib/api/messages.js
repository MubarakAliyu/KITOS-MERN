/**
 * Messages API service.
 *
 * The chat screens call `@/_lib/api/chat`, which is where conversations and
 * messages live. This module is the named entry point the rest of the app was
 * written against, so it re-exports that surface rather than duplicating it —
 * two modules issuing the same requests would be two places for the contract
 * to drift.
 */
export {
  getConversations,
  getMessages,
  sendMessage,
  markMessagesRead,
  getAllConversations,
  getChatContacts,
  reportConversation,
} from "./chat";

import {
  getConversations,
  getMessages,
  sendMessage,
  markMessagesRead,
  getAllConversations,
  getChatContacts,
  reportConversation,
} from "./chat";

/** The object form, for callers that prefer a namespace. */
export const messagesApi = {
  getConversations,
  getMessages,
  sendMessage,
  markMessagesRead,
  getAllConversations,
  getChatContacts,
  reportConversation,
};
