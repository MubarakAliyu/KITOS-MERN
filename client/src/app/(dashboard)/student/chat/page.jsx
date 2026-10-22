"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useChat } from "@/_hooks/useChat";
import { ConversationList } from "@/_components/chat/ConversationList";
import { ChatWindow } from "@/_components/chat/ChatWindow";
import { useSession } from "next-auth/react";

export default function StudentChatPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const {
    conversations,
    activeConvId,
    setActiveConvId,
    activeConversation,
    messages,
    loading,
    sending,
    socketConnected,
    typingUsers,
    searchQuery,
    setSearchQuery,
    sendMessage,
    emitTyping,
  } = useChat(userId);

  const [showList, setShowList] = useState(true);

  if (!userId) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <Loader2 className="h-8 w-8 animate-spin text-[#10B981]" />
      </div>
    );
  }

  function handleSelect(convId) {
    setActiveConvId(convId);
    setShowList(false);
  }

  function handleBack() {
    setShowList(true);
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
          showList ? "flex" : "hidden"
        }`}
      >
        <header className="border-b border-[var(--border-color)] px-4 pb-3 pt-4">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            Messages
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Chat with your instructors
          </p>
        </header>
        <ConversationList
          conversations={conversations}
          activeConvId={activeConvId}
          onSelect={handleSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loading={loading}
          emptyMessage="No conversations yet"
        />
      </aside>

      <section
        className={`flex-1 flex-col md:flex ${
          !showList ? "flex" : "hidden"
        }`}
      >
        {activeConvId ? (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--border-color)] p-2 md:hidden">
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back to conversations"
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
