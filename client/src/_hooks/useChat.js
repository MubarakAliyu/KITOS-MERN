"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversations,
  getMessages,
  markMessagesRead,
  sendMessage as apiSendMessage,
} from "@/_lib/api/chat";
import { getSocket, disconnectSocket } from "@/_lib/socket";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

/**
 * Per-page chat state. Loads conversations for `userId`, lazily fetches
 * messages for the active conversation, sends through MSW (and a socket if
 * one is connected), and surfaces typing + offline state to the UI.
 *
 * The socket is best-effort — if it can't connect, the rest of the chat
 * works through optimistic updates against the MSW handlers.
 */
export function useChat(userId) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  /**
   * The same flag as a ref, read by the send guard.
   *
   * `sending` state is a render behind: two keystrokes in the same tick
   * both see `false` and both post. A ref is current immediately, which is
   * what a guard against a double send needs.
   */
  const sendingRef = useRef(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const typingTimeoutRef = useRef(null);
  const { notify } = useLiveNotify();

  // Initial conversation load.
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getConversations(userId)
      .then((data) => {
        setConversations(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn("Conversations fetch failed:", err.message);
        setConversations([]);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  // Socket lifecycle. Best-effort connect; UI keeps working if it fails.
  useEffect(() => {
    if (!userId) return;
    // Null until a Socket.IO endpoint is configured (Batch 3). The chat
    // surfaces already fall back to local state with an offline banner.
    const socket = getSocket();
    if (!socket) return;
    socket.connect();

    function handleConnect() {
      setSocketConnected(true);
      socket.emit("join", { userId });
      // Rejoin the open thread: a reconnection starts with empty rooms, and
      // without this typing indicators stop arriving after a brief drop.
      if (activeConvIdRef.current) {
        socket.emit("join", { conversation_id: activeConvIdRef.current });
      }
    }
    function handleDisconnect() {
      setSocketConnected(false);
    }
    /**
     * A message arriving over the socket.
     *
     * Appending unconditionally put one send on screen three times. The
     * server broadcasts a new message to the conversation room *and* to the
     * recipient's own room, so anyone in both gets it twice; the sender
     * already has it from the REST response that created it; and the client
     * used to re-emit after saving, asking for a third relay.
     *
     * Two guards, because either alone leaves a gap. Dropping your own
     * messages stops the echo of something already on screen. Dropping ids
     * already present stops every other double-delivery, whatever path it
     * came by — and it is the one that keeps working if the server's emit
     * strategy changes.
     */
    function handleMessage(msg) {
      const convId = msg.conversation_id;
      if (!convId) return;

      // Already on screen from the REST response that created it.
      if (msg.sender_id && String(msg.sender_id) === String(userId)) return;

      setMessagesByConv((prev) => {
        const existing = prev[convId] ?? [];
        if (msg.id && existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [convId]: [...existing, msg] };
      });
      setConversations((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((c) =>
          c.id === convId
            ? {
                ...c,
                last_message: msg.message,
                last_message_time: msg.created_at,
                unread_count:
                  convId === activeConvIdRef.current
                    ? 0
                    : (c.unread_count ?? 0) + 1,
              }
            : c
        );
      });
      if (convId !== activeConvIdRef.current) {
        notify("new_message", {
          sender: msg.sender_name ?? "Someone",
          message: (msg.message ?? "").slice(0, 50),
        });
      }
    }
    function handleTyping({ userId: typingId, conversationId }) {
      setTypingUsers((prev) => ({ ...prev, [conversationId]: typingId }));
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
      }, 2000);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("message", handleMessage);
    socket.on("typing", handleTyping);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("message", handleMessage);
      socket.off("typing", handleTyping);
      disconnectSocket();
    };
    // We intentionally exclude `notify` — the hook returns a stable-enough
    // reference per render and re-running the whole socket setup on
    // toast/store changes would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Join the open thread's room.
   *
   * Messages reach a recipient through their own user room either way, but
   * typing indicators are relayed to the conversation room only — nobody who
   * has not joined it hears them.
   */
  useEffect(() => {
    if (!activeConvId) return;
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("join", { conversation_id: activeConvId });
    }
  }, [activeConvId]);

  // Lazy-load messages for the active conversation + mark them read.
  useEffect(() => {
    if (!activeConvId) return;
    if (messagesByConv[activeConvId]) {
      // Already cached — still mark read for the badge.
      markMessagesRead(activeConvId).catch(() => {});
      setConversations((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((c) =>
          c.id === activeConvId ? { ...c, unread_count: 0 } : c
        );
      });
      return;
    }
    getMessages(activeConvId)
      .then((msgs) => {
        setMessagesByConv((prev) => ({ ...prev, [activeConvId]: msgs }));
      })
      .catch((err) => console.warn("Messages fetch failed:", err.message));
    markMessagesRead(activeConvId)
      .then(() => {
        setConversations((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          return list.map((c) =>
            c.id === activeConvId ? { ...c, unread_count: 0 } : c
          );
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId]);

  const sendMessage = useCallback(
    async ({ text, fileUrl, fileType }) => {
      if (!activeConvId || !userId) return;
      // A double tap on a slow connection is two messages, not one. The
      // composer disables itself on `sending`, but the guard belongs here
      // too — the Enter key does not go through the button.
      if (sendingRef.current) return;
      const list = Array.isArray(conversations) ? conversations : [];
      const activeConv = list.find((c) => c.id === activeConvId);
      if (!activeConv) return;

      const tempId = `temp_${Date.now()}`;
      const optimistic = {
        id: tempId,
        sender_id: userId,
        receiver_id: activeConv.participant_id,
        message: text || "",
        file_url: fileUrl || null,
        file_type: fileType || null,
        created_at: new Date().toISOString(),
        read: false,
        sending: true,
      };
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConvId]: [...(prev[activeConvId] ?? []), optimistic],
      }));

      setSending(true);
      sendingRef.current = true;
      try {
        const saved = await apiSendMessage({
          conversation_id: activeConvId,
          sender_id: userId,
          receiver_id: activeConv.participant_id,
          message: text || "",
          file_url: fileUrl || null,
          file_type: fileType || null,
        });
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
            m.id === tempId ? { ...saved, sending: false } : m
          ),
        }));
        setConversations((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          return list.map((c) =>
            c.id === activeConvId
              ? {
                  ...c,
                  last_message: text || (fileType ? "Attachment" : ""),
                  last_message_time: saved.created_at,
                }
              : c
          );
        });

        /**
         * No socket emit here.
         *
         * `POST /messages` already broadcasts the saved message to the
         * conversation room and to the recipient. Emitting it again asked
         * the server to relay a message it had just relayed, which is one
         * of the three copies a single send used to produce.
         */
      } catch {
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
            m.id === tempId ? { ...m, failed: true, sending: false } : m
          ),
        }));
      } finally {
        setSending(false);
        sendingRef.current = false;
      }
    },
    [activeConvId, userId, conversations]
  );

  const emitTyping = useCallback(() => {
    if (!activeConvId) return;
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("typing", {
        userId,
        conversationId: activeConvId,
      });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {}, 2000);
  }, [activeConvId, userId]);

  const list = Array.isArray(conversations) ? conversations : [];
  const filteredConversations = searchQuery
    ? list.filter((c) => {
        const q = searchQuery.toLowerCase();
        return (
          c.participant_name?.toLowerCase().includes(q) ||
          c.last_message?.toLowerCase().includes(q)
        );
      })
    : list;

  return {
    conversations: filteredConversations,
    allConversations: list,
    activeConvId,
    setActiveConvId,
    activeConversation: list.find((c) => c.id === activeConvId),
    messages: messagesByConv[activeConvId] ?? [],
    loading,
    sending,
    socketConnected,
    typingUsers,
    searchQuery,
    setSearchQuery,
    sendMessage,
    emitTyping,
  };
}
