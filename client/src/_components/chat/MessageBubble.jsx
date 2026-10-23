"use client";

import { motion } from "motion/react";
import { format } from "date-fns";
import { FileText } from "lucide-react";

const ROLE_BG = {
  student: "bg-[#10B981]",
  instructor: "bg-[#3B82F6]",
  parent: "bg-amber-500",
  admin: "bg-purple-500",
};

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
  participantInitial = "?",
  participantRole = "instructor",
}) {
  const avatarBg = ROLE_BG[participantRole] ?? "bg-[#10B981]";

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-end gap-2 ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      {!isOwn && (
        <div
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${
            showAvatar ? avatarBg : "bg-transparent"
          }`}
          aria-hidden={!showAvatar}
        >
          {showAvatar ? participantInitial : ""}
        </div>
      )}

      <div className={`flex max-w-[70%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
            isOwn
              ? "rounded-br-sm bg-[#10B981] text-white"
              : "rounded-bl-sm border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]"
          } ${message.sending ? "opacity-70" : ""}`}
        >
          {message.file_url && message.file_type === "image" && (
            <a
              href={message.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 block overflow-hidden rounded-lg"
            >
              <img
                src={message.file_url}
                alt="Attachment"
                className="max-h-48 max-w-full cursor-pointer rounded-lg object-cover"
              />
            </a>
          )}
          {message.file_url && message.file_type === "pdf" && (
            <a
              href={message.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                isOwn ? "bg-white/15 text-white" : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              }`}
            >
              <FileText className="h-4 w-4 shrink-0 text-red-400" />
              <span className="flex-1 truncate font-mono-ui">
                {message.file_url.split("/").pop() || "Document"}
              </span>
              <span className="font-mono-ui font-semibold underline">Download</span>
            </a>
          )}
          {message.message && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.message}
            </p>
          )}
        </div>
        <span className="mt-1 px-1 text-[10px] text-[var(--text-muted)] font-mono-ui">
          {message.sending ? (
            <span className="italic">Sending…</span>
          ) : message.failed ? (
            <span className="font-semibold text-red-500">Failed to send · Retry</span>
          ) : (
            format(new Date(message.created_at), "HH:mm")
          )}
        </span>
      </div>
    </motion.li>
  );
}
