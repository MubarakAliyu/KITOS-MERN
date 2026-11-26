import { Server } from "socket.io";
import { env, isProduction } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import * as chatService from "../services/chat.service.js";
import {
  registerRealtime,
  clearRealtime,
  userRoom,
  conversationRoom,
} from "./emit.js";

/**
 * Socket.IO, on the same HTTP server as the REST API (PRD §7.1).
 *
 * One port, one origin, one token. Sharing the server is what lets a single
 * Render web service carry both, which the free tier requires — and it means
 * the socket handshake is subject to the same CORS origin as every request.
 *
 * The handshake is authenticated exactly as REST is: the same signed token,
 * the same token-version check, the same active-account check. A socket that
 * skipped any of those would be a way around the whole authorisation model,
 * since it outlives the request that opened it.
 */

function allowedOrigins() {
  const origins = new Set([env.CLIENT_ORIGIN]);
  if (!isProduction()) {
    origins.add("http://localhost:3004");
    origins.add("http://127.0.0.1:3004");
  }
  return [...origins];
}

/**
 * Resolves the handshake token to a live user, or throws.
 *
 * Mirrors `middleware/authenticate.js`: signature and expiry, the account
 * still exists and is active, and `tv` matches the stored token version — so
 * a password change or a deactivation drops the socket on its next
 * connection rather than leaving it live for up to 24 hours.
 */
async function authenticate(handshakeToken) {
  const token = String(handshakeToken ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("No token");

  const claims = verifyAccessToken(token);

  // token_version is select:false, so it must be asked for explicitly —
  // without it the revocation check below reads undefined and passes.
  const user = await User.findById(claims.sub).select("+token_version");

  if (!user) throw new Error("Account no longer exists");
  if (!user.is_active) throw new Error("Account is disabled");
  if ((user.token_version ?? 0) !== claims.tv) {
    throw new Error("Token has been revoked");
  }

  return user;
}

/**
 * Attaches Socket.IO and returns the server.
 *
 * Idempotent in the sense that it registers itself on the realtime bus, so
 * every service can push from then on.
 */
export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins(),
      credentials: true,
    },
    // Both, in the order the client negotiates them: polling to establish
    // the session, then an upgrade to WebSocket where the network allows
    // one. Listing websocket first here would not force it — the client
    // chooses — but naming polling first matches what actually happens and
    // keeps chat working on hosts that refuse the upgrade.
    transports: ["polling", "websocket"],
    // Render's proxy closes an idle connection; a ping well inside that keeps
    // a quiet chat window connected instead of flapping.
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket.handshake.auth?.token);
      socket.data.user = user;
      next();
    } catch (err) {
      logger.warn(
        { err: err.message, address: socket.handshake.address },
        "Socket handshake refused"
      );
      // The client shows its offline banner on this; the message is
      // deliberately vague, as an unauthenticated caller learns nothing.
      next(new Error("Not authorised"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const userId = String(user._id);

    // Their own room, for notifications and for messages arriving while the
    // conversation list rather than a thread is open.
    socket.join(userRoom(userId));

    logger.debug({ user: userId, role: user.role }, "Socket connected");

    /**
     * `join` — the retained client emits `{ userId }` on connect and the PRD
     * describes `{ conversation_id }`. Both are accepted: the frontend
     * contract wins where they differ (ADR-021), and a client that wants a
     * single thread should be able to ask for it.
     */
    socket.on("join", async (payload = {}) => {
      const conversationId = payload.conversation_id ?? payload.conversationId;

      if (!conversationId) {
        // The `{ userId }` form. Nothing to do — they are already in their
        // own room, and the id in the payload is not trusted anyway.
        return;
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        await chatService.assertCanRead({ user, conversation });
        socket.join(conversationRoom(conversationId));
      } catch (err) {
        logger.debug(
          { err: err.message, user: userId, conversationId },
          "Socket join refused"
        );
      }
    });

    /**
     * `message` — the client persists over REST and then emits, so the usual
     * case here is a relay of something already saved.
     *
     * A payload carrying the id of a message that exists is relayed and not
     * written again; anything else is persisted through the same service the
     * REST route uses, so a socket-only client cannot bypass the pair rules,
     * the rate of writes aside. Without the first half every message sent by
     * the retained UI would be stored twice.
     */
    socket.on("message", async (payload = {}) => {
      try {
        if (payload.id) {
          const existing = await Message.findById(payload.id).catch(() => null);
          if (existing) {
            const conversation = await Conversation.findById(
              existing.conversation_id
            );
            if (!conversation) return;
            await chatService.assertCanRead({ user, conversation });

            // To the room, except the sender, who already has it.
            socket
              .to(conversationRoom(String(existing.conversation_id)))
              .emit("message", {
                id: String(existing._id),
                conversation_id: String(existing.conversation_id),
                sender_id: String(existing.sender_id),
                receiver_id: String(existing.receiver_id),
                message: existing.message ?? "",
                file_url: existing.file_url ?? null,
                file_type: existing.file_type ?? null,
                read: existing.read,
                created_at: existing.created_at?.toISOString() ?? null,
              });
            return;
          }
        }

        // Not persisted yet: do it properly, rules and all. `postMessage`
        // emits to the room itself.
        await chatService.postMessage({
          user,
          payload: {
            conversation_id: payload.conversation_id,
            receiver_id: payload.receiver_id,
            message: payload.message,
            file_url: payload.file_url,
            file_type: payload.file_type,
          },
        });
      } catch (err) {
        logger.debug(
          { err: err.message, user: userId },
          "Socket message refused"
        );
        socket.emit("message:error", { error: err.message });
      }
    });

    /**
     * `typing` — relayed, never stored. The client sends
     * `{ userId, conversationId }` and expects the same shape back.
     */
    socket.on("typing", async (payload = {}) => {
      const conversationId = payload.conversationId ?? payload.conversation_id;
      if (!conversationId) return;

      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        await chatService.assertCanRead({ user, conversation });

        socket.to(conversationRoom(String(conversationId))).emit("typing", {
          userId,
          conversationId: String(conversationId),
        });
      } catch {
        // A typing indicator is not worth reporting a failure for.
      }
    });

    socket.on("disconnect", (reason) => {
      logger.debug({ user: userId, reason }, "Socket disconnected");
    });
  });

  registerRealtime(io);
  logger.info(
    { origins: allowedOrigins() },
    "Socket.IO attached to the HTTP server"
  );

  return io;
}

/** Closes every connection, for a clean shutdown. */
export async function detachRealtime(io) {
  clearRealtime();
  if (!io) return;
  await new Promise((resolve) => io.close(resolve));
}
