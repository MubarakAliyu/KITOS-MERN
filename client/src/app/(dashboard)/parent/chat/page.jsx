"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, MessageSquare, Loader2 } from "lucide-react";
import { useChat } from "@/_hooks/useChat";
import { ChatWindow } from "@/_components/chat/ChatWindow";
import { useSession } from "next-auth/react";

export default function ParentChatPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const {
    allConversations,
    activeConvId,
    setActiveConvId,
    activeConversation,
    messages,
    loading,
    sending,
    socketConnected,
    typingUsers,
    sendMessage,
    emitTyping,
  } = useChat(userId);

  // Parent has exactly one channel — the admin support team. Auto-select it
  // on desktop the moment it loads so they don't see an awkward empty pane.
  const supportConv = allConversations[0] ?? null;
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!supportConv || activeConvId) return;
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setActiveConvId(supportConv.id);
    }
  }, [supportConv, activeConvId, setActiveConvId]);

  if (!userId) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <Loader2 className="h-8 w-8 animate-spin text-[#10B981]" />
      </div>
    );
  }

  function handleStartChat() {
    if (supportConv) {
      setActiveConvId(supportConv.id);
      setShowChat(true);
    }
  }

  function handleBack() {
    setShowChat(false);
    setActiveConvId(null);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      <aside
        className={`w-full shrink-0 flex-col border-r border-[var(--border-color)] md:w-80 md:flex ${
          showChat ? "hidden" : "flex"
        }`}
      >
        <header className="border-b border-[var(--border-color)] px-4 pb-3 pt-4">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            Support
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Contact Kids In Tech support
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="skeleton-shimmer h-32 rounded-2xl" />
          ) : supportConv ? (
            <SupportCard
              conversation={supportConv}
              active={supportConv.id === activeConvId}
              onClick={handleStartChat}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-color)] p-6 text-center text-sm text-[var(--text-secondary)]">
              Support is currently unavailable.
            </div>
          )}
        </div>
      </aside>

      <section
        className={`flex-1 flex-col md:flex ${
          showChat || activeConvId ? "flex" : "hidden md:flex"
        }`}
      >
        {activeConvId && activeConversation ? (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--border-color)] p-2 md:hidden">
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back to support"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Back
              </span>
            </div>
            <ChatWindow
              conversation={activeConversation}
              messages={messages}
              onSend={sendMessage}
              sending={sending}
              currentUserId={userId}
              typingUsers={typingUsers}
              socketConnected={socketConnected}
              emitTyping={emitTyping}
            />
          </>
        ) : (
          <ChatWindow
            conversation={null}
            messages={[]}
            onSend={() => {}}
            currentUserId={userId}
            socketConnected={socketConnected}
          />
        )}
      </section>
    </motion.div>
  );
}

function SupportCard({ conversation, active, onClick }) {
  const hasMessages = !!conversation.last_message;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-[#10B981] bg-[#10B981]/10"
          : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#10B981] text-xs font-bold text-white">
          KIT
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[var(--text-primary)]">
              Kids In Tech Support
            </span>
            {conversation.unread_count > 0 && (
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#10B981] px-1.5 text-[10px] font-bold text-white font-mono-ui">
                {conversation.unread_count}
              </span>
            )}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Typically replies within 24 hours
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
              Available
            </span>
          </div>
        </div>
      </div>

      {hasMessages ? (
        <div className="border-t border-[var(--border-color)] pt-3 text-xs">
          <p className="line-clamp-2 text-[var(--text-secondary)]">
            {conversation.last_message}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-[#10B981]/10 px-3 py-2 text-xs font-semibold text-[#10B981] font-mono-ui">
          <MessageSquare className="h-3.5 w-3.5" />
          Start Chat
        </div>
      )}
    </motion.button>
  );
}
