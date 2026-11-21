"use client";

import { io } from "socket.io-client";

/**
 * The Socket.IO endpoint. Chat arrives in Batch 3; until the server exists,
 * leave `NEXT_PUBLIC_SOCKET_URL` unset and nothing dials out.
 *
 * Dialling an endpoint that is not there is not free: the browser itself logs
 * a failed WebSocket handshake as a console error, which no application code
 * can suppress — `connect_error` fires afterwards, too late. Every chat
 * surface already falls back to local state with an "Offline mode" banner, so
 * not connecting is the same experience without the noise.
 */
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || null;

let socketInstance = null;

/** True when a Socket.IO endpoint is configured. */
export function isRealtimeConfigured() {
  return Boolean(SOCKET_URL);
}

/**
 * Lazy singleton socket, or **null** when no endpoint is configured.
 *
 * Callers must handle null — `socket?.connect()` and so on. Returning a dead
 * socket object instead would hide the fact that realtime is off and leave
 * the UI claiming to be connected.
 */
export function getSocket(token) {
  if (!SOCKET_URL) return null;

  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token: token || "dev-token" },
      transports: ["websocket", "polling"],
      timeout: 5000,
      reconnectionAttempts: 3,
    });

    socketInstance.on("connect_error", (err) => {
      console.debug("Socket connect error:", err?.message ?? err);
    });
  }
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
