"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { MessageSquare, WifiOff } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";

const ROLE_BG = {
  student: "bg-[#10B981]",
  instructor: "bg-[#3B82F6]",
  parent: "bg-amber-500",
  admin: "bg-purple-500",
};

const ROLE_BADGE = {
  student: "Student",
  instructor: "Instructor",
  parent: "Parent",
  admin: "Admin",
};

function formatDateSeparator(date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

export function ChatWindow({
  conversation,
  messages,
  onSend,
  sending,
  currentUserId,
  typingUsers = {},
  socketConnected,
  emitTyping,
  readOnly = false,
  readOnlyMessage,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-[var(--text-muted)]">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[var(--bg-secondary)]">
          <MessageSquare className="h-9 w-9 text-[#10B981]/50" />
        </div>
        <div className="text-center">
          <p className="font-medium text-[var(--text-primary)]">Your messages</p>
          <p className="mt-1 text-sm">
            Select a conversation to start chatting
          </p>
        </div>
      </div>
    );
  }

  const avatarBg = ROLE_BG[conversation.participant_role] ?? "bg-[#10B981]";
  const isTyping = !!typingUsers[conversation.id];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={conversation.id}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
        className="flex h-full flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarBg}`}
          >
            {conversation.participant_initial}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold text-[var(--text-primary)]">
              {conversation.participant_name}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
              {ROLE_BADGE[conversation.participant_role] ?? conversation.participant_role}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                socketConnected ? "bg-green-500" : "bg-amber-500"
              }`}
            />
            <span className="text-xs text-[var(--text-muted)] font-mono-ui">
              {socketConnected ? "Online" : "Offline mode"}
            </span>
          </div>
        </div>

        <AnimatePresence>
          {!socketConnected && (
            <motion.div
              key="offline-banner"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>
                Offline mode — messages saved locally. Connect to sync.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 space-y-1 overflow-y-auto bg-[var(--bg-secondary)] px-4 py-5">
          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            participantInitial={conversation.participant_initial}
            participantRole={conversation.participant_role}
          />
          <AnimatePresence>
            {isTyping && (
              <TypingIndicator participantName={conversation.participant_name} />
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {readOnly ? (
          <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-600 dark:text-amber-400">
            {readOnlyMessage ??
              "This conversation is read-only. Admin view only."}
          </div>
        ) : (
          <MessageInput
            onSend={onSend}
            disabled={sending}
            onTyping={emitTyping}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function MessageList({
  messages,
  currentUserId,
  participantInitial,
  participantRole,
}) {
  const blocks = [];
  let lastDate = null;
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    const d = new Date(m.created_at);
    if (!lastDate || !isSameDay(d, lastDate)) {
      blocks.push({ kind: "date", key: `d-${m.id}`, value: d });
      lastDate = d;
    }
    const prev = messages[i - 1];
    const showAvatar =
      m.sender_id !== currentUserId &&
      (!prev || prev.sender_id !== m.sender_id);
    blocks.push({ kind: "msg", key: m.id, value: m, showAvatar });
  }

  return (
    <ul className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {blocks.map((b) =>
          b.kind === "date" ? (
            <li key={b.key} className="my-3 flex items-center justify-center">
              <div className="flex w-full items-center gap-3">
                <span className="h-px flex-1 bg-[var(--border-color)]" />
                <span className="rounded-full bg-[var(--bg-card)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  {formatDateSeparator(b.value)}
                </span>
                <span className="h-px flex-1 bg-[var(--border-color)]" />
              </div>
            </li>
          ) : (
            <MessageBubble
              key={b.key}
              message={b.value}
              isOwn={b.value.sender_id === currentUserId}
              showAvatar={b.showAvatar}
              participantInitial={participantInitial}
              participantRole={participantRole}
            />
          )
        )}
      </AnimatePresence>
    </ul>
  );
}
