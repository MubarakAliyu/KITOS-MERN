"use client";

import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

let socketInstance = null;

/**
 * Lazy singleton socket. The dev server isn't running by default — every
 * dashboard chat page falls back to optimistic local updates and the
 * Topbar+ChatWindow show an "Offline mode" banner. The connect attempt is
 * non-fatal: connect_error logs at debug level only.
 */
export function getSocket(token) {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token: token || "dev-token" },
      transports: ["websocket", "polling"],
      timeout: 5000,
      reconnectionAttempts: 3,
    });

    socketInstance.on("connect_error", (err) => {
      console.debug(
        "Socket connect error (expected in dev):",
        err?.message ?? err
      );
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
