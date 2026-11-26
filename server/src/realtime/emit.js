import { logger } from "../lib/logger.js";

/**
 * The one way a service pushes something to a connected client.
 *
 * Services must not import the Socket.IO server. It is created in
 * `index.js` after the HTTP server exists, it does not exist at all in the
 * test suite, and a service that reached for it directly would either pull a
 * listening socket into every unit test or need mocking in all of them.
 *
 * So the socket layer registers itself here at boot and the services call
 * these functions. With nothing registered they are no-ops, which is exactly
 * right: a notification is persisted either way, and the push is a courtesy
 * on top. Nothing in the system may depend on a client being connected.
 */

let io = null;

/** Called once by the socket layer at boot. */
export function registerRealtime(server) {
  io = server;
}

/** Used by tests and by shutdown, so no stale server is left registered. */
export function clearRealtime() {
  io = null;
}

export function isRealtimeAttached() {
  return io !== null;
}

/** The room a user's own devices join: every tab they have open. */
export const userRoom = (userId) => `user:${userId}`;

/** The room a conversation's participants and observers join. */
export const conversationRoom = (conversationId) => `conv:${conversationId}`;

/**
 * Emits to a room, swallowing any failure.
 *
 * A broken push must never fail the request that caused it. The notification
 * is already in the database; the worst case is that the recipient sees it on
 * their next page load instead of immediately.
 */
function emit(room, event, payload) {
  if (!io) return false;
  try {
    io.to(room).emit(event, payload);
    return true;
  } catch (err) {
    logger.warn({ err, room, event }, "Realtime emit failed");
    return false;
  }
}

export function emitToUser(userId, event, payload) {
  return emit(userRoom(userId), event, payload);
}

export function emitToConversation(conversationId, event, payload) {
  return emit(conversationRoom(conversationId), event, payload);
}

/**
 * Pushes a persisted notification to its owner.
 *
 * Every service that creates a notification calls this, so the bell updates
 * without a refresh (FR17).
 */
export function pushNotification(notification) {
  if (!notification?.user_id) return false;
  return emitToUser(String(notification.user_id), "notification", notification);
}
