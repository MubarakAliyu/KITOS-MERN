"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { getNotifications } from "@/_lib/api/notifications";
import { useNotificationStore } from "@/_store/notificationStore";
import { getSocket } from "@/_lib/socket";

/**
 * Loads the signed-in user's notification feed and keeps it current.
 *
 * The store is the single source of truth — the bell in the topbar and each
 * role's notifications page both read it — so this hook fills it and then
 * subscribes, rather than holding state of its own. Mounting it twice is
 * harmless for that reason.
 *
 * The socket is a courtesy on top: every notification is persisted before it
 * is pushed, so a user with no realtime connection sees the same feed on
 * their next page load. Nothing here is required for correctness.
 */
export function useNotifications() {
  const { data: session, status } = useSession();
  const { notifications, unreadCount, setNotifications, addNotification } =
    useNotificationStore();

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    getNotifications()
      .then((list) => {
        if (!cancelled) setNotifications(list);
      })
      .catch((err) => {
        // The bell is not worth an error screen; it fills on the next load.
        console.debug("Notifications fetch failed:", err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [status, setNotifications]);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    // Null until NEXT_PUBLIC_SOCKET_URL is set.
    const socket = getSocket();
    if (!socket) return;

    if (!socket.connected) socket.connect();

    function handleNotification(notification) {
      if (!notification?.id) return;
      addNotification(notification);
    }

    socket.on("notification", handleNotification);
    return () => {
      socket.off("notification", handleNotification);
    };
    // The socket is a shared singleton and `addNotification` is stable, so
    // this subscribes once per signed-in user rather than per render.
  }, [status, userId, addNotification]);

  return { notifications, unreadCount };
}
