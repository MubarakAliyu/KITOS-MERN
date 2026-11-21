"use client";

import { io } from "socket.io-client";
import { getSession } from "next-auth/react";

/**
 * The Socket.IO endpoint.
 *
 * Dialling an endpoint that is not there is not free: the browser itself logs
 * a failed WebSocket handshake as a console error, which no application code
 * can suppress — `connect_error` fires afterwards, too late. So with
 * `NEXT_PUBLIC_SOCKET_URL` unset nothing dials out, and every chat surface
 * falls back to its "Offline mode" banner, which is the same experience
 * without the noise.
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
 *
 * The handshake carries the NextAuth session's access token, which the server
 * verifies exactly as it verifies a REST request: signature, expiry, token
 * version and the account still being active. `auth` is read fresh on every
 * reconnection attempt rather than captured once, so a socket that drops
 * after a password change reconnects with the current token or not at all.
 */
export function getSocket() {
  if (!SOCKET_URL) return null;

  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      // A function, so socket.io calls it again on each reconnect.
      auth: async (callback) => {
        const session = await getSession().catch(() => null);
        callback({ token: session?.accessToken ?? null });
      },
      transports: ["websocket", "polling"],
      timeout: 10000,
      reconnectionAttempts: 5,
    });

    socketInstance.on("connect_error", (err) => {
      // Expected while the server wakes from a cold start, so this is not an
      // error the user needs to see — the offline banner already says it.
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
