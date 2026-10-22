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
    const socket = getSocket();
    socket.connect();

    function handleConnect() {
      setSocketConnected(true);
      socket.emit("join", { userId });
    }
    function handleDisconnect() {
      setSocketConnected(false);
    }
    function handleMessage(msg) {
      const convId = msg.conversation_id;
      if (!convId) return;
      setMessagesByConv((prev) => ({
        ...prev,
        [convId]: [...(prev[convId] ?? []), msg],
      }));
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

        const socket = getSocket();
        if (socket.connected) {
          socket.emit("message", {
            ...saved,
            conversation_id: activeConvId,
          });
        }
      } catch {
        setMessagesByConv((prev) => ({
          ...prev,
          [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
            m.id === tempId ? { ...m, failed: true, sending: false } : m
          ),
        }));
      } finally {
        setSending(false);
      }
    },
    [activeConvId, userId, conversations]
  );

  const emitTyping = useCallback(() => {
    if (!activeConvId) return;
    const socket = getSocket();
    if (socket.connected) {
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
