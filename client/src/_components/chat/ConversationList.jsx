"use client";

import { motion } from "motion/react";
import { format, isSameDay } from "date-fns";
import { MessageSquare, Search, X } from "lucide-react";

// Avatar background colour per role — keeps the participant identity
// glanceable when admin sees a mixed list of student/instructor/parent
// conversations side by side.
const ROLE_BG = {
  student: "bg-[#10B981]",
  instructor: "bg-[#3B82F6]",
  parent: "bg-amber-500",
  admin: "bg-purple-500",
};

function formatLastMsgTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isSameDay(d, new Date()) ? format(d, "HH:mm") : format(d, "MMM d");
}

export function ConversationList({
  conversations,
  activeConvId,
  onSelect,
  searchQuery,
  onSearchChange,
  emptyMessage = "No conversations yet",
  loading = false,
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] py-2 pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <ConvListSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyConvState message={emptyMessage} />
        ) : (
          <ul className="flex flex-col">
            {conversations.map((c, i) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                active={c.id === activeConvId}
                index={i}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conversation, active, index, onClick }) {
  const bg = ROLE_BG[conversation.participant_role] ?? "bg-[#10B981]";
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ x: 2 }}
        transition={{ duration: 0.15 }}
        className={`relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
          active
            ? "border-l-4 border-[#10B981] bg-[#10B981]/10 pl-3"
            : "border-l-4 border-transparent hover:bg-[var(--bg-secondary)]"
        }`}
      >
        <div className="relative shrink-0">
          <div
            className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white ${bg}`}
          >
            {conversation.participant_initial}
          </div>
          {conversation.unread_count > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-card)] bg-[#10B981]"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${
                active
                  ? "font-bold text-[#10B981]"
                  : "font-semibold text-[var(--text-primary)]"
              }`}
            >
              {conversation.participant_name}
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)] font-mono-ui">
              {formatLastMsgTime(conversation.last_message_time)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="line-clamp-1 flex-1 text-xs text-[var(--text-secondary)]">
              {conversation.last_message || (
                <span className="italic text-[var(--text-muted)]">
                  No messages yet
                </span>
              )}
            </span>
            {conversation.unread_count > 0 && !active && (
              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
                className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-[#10B981] px-1.5 text-[10px] font-bold text-white font-mono-ui"
              >
                {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
              </motion.span>
            )}
          </div>
        </div>
      </motion.button>
    </motion.li>
  );
}

function ConvListSkeleton() {
  return (
    <ul className="flex flex-col gap-2 p-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="skeleton-shimmer h-14 rounded-xl" />
      ))}
    </ul>
  );
}

function EmptyConvState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <MessageSquare className="h-6 w-6" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}
