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

  /**
   * A parent has their own conversations, and their children's.
   *
   * This page used to take `allConversations[0]` and call it "the admin
   * support team", on the assumption that a parent has exactly one channel.
   * They do not: the API also returns every conversation their child is in,
   * marked `observing`, because watching them is a safeguarding
   * requirement (PRD §10).
   *
   * Two things went wrong because of that. The child's threads were never
   * shown at all, so the oversight the product promises was unreachable.
   * And the order of the list is not guaranteed, so when an observed thread
   * came first the parent was dropped into their child's conversation
   * labelled as their own support channel — they replied, and the API
   * refused it with a 403 that surfaced as "Failed to send · Retry".
   */
  const ownConversations = allConversations.filter((c) => !c.observing);
  const observedConversations = allConversations.filter((c) => c.observing);
  const supportConv = ownConversations[0] ?? null;
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!supportConv || activeConvId) return;
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setActiveConvId(supportConv.id);
    }
  }, [supportConv, activeConvId, setActiveConvId]);

  if (!userId) {
    return (
      <div className="flex h-[calc(100dvh-9rem)] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
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
      className="flex h-[calc(100dvh-9rem)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {loading ? (
            <div className="skeleton-shimmer h-32 rounded-2xl" />
          ) : (
            <>
              {supportConv ? (
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

              {/*
                The child's conversations, which the parent may read and not
                write in. Kept in their own group and labelled, so nobody
                mistakes one for a thread of their own — which is how a
                reply ended up being attempted, and refused, in the first
                place.
              */}
              {observedConversations.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                    Your children&apos;s conversations
                  </h2>
                  <p className="px-1 text-xs text-[var(--text-secondary)]">
                    You can read these. Only your child can reply.
                  </p>
                  {observedConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        setActiveConvId(conversation.id);
                        setShowChat(true);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        conversation.id === activeConvId
                          ? "border-[#10B981] bg-[#10B981]/5"
                          : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-secondary)]">
                        {conversation.participant_initial}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                          {conversation.child_name ?? "Your child"} &amp;{" "}
                          {conversation.participant_name}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {conversation.last_message || "No messages yet"}
                        </span>
                      </span>
                    </button>
                  ))}
                </section>
              )}
            </>
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
            {/*
              A parent reads their child's conversations and cannot write
              in them (ADR-030) — reading is the safeguarding requirement,
              writing as the child would be impersonation. The composer was
              shown anyway, so a reply looked possible and came back 403 as
              "Failed to send · Retry", which reads like a fault rather
              than a rule.
            */}
            <ChatWindow
              conversation={activeConversation}
              messages={messages}
              onSend={sendMessage}
              sending={sending}
              currentUserId={userId}
              typingUsers={typingUsers}
              socketConnected={socketConnected}
              emitTyping={emitTyping}
              readOnly={Boolean(activeConversation?.observing)}
              readOnlyMessage={
                activeConversation?.child_name
                  ? `This is ${activeConversation.child_name}'s conversation. You can read it, but only they can reply.`
                  : "You can read this conversation but not reply to it."
              }
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
