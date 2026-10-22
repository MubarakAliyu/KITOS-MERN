"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { format, isSameDay } from "date-fns";
import { ChevronLeft, MessageSquare, Search, X } from "lucide-react";
import { useChat } from "@/_hooks/useChat";
import { ChatWindow } from "@/_components/chat/ChatWindow";
import { getAllConversations, getMessages } from "@/_lib/api/chat";

const ADMIN_ID = "admin1";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "parent_admin", label: "Parent ↔ Admin" },
  { key: "student_instructor", label: "Student ↔ Instructor" },
];

const ROLE_BG = {
  student: "bg-[#10B981]",
  instructor: "bg-[#3B82F6]",
  parent: "bg-amber-500",
  admin: "bg-purple-500",
};

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isSameDay(d, new Date()) ? format(d, "HH:mm") : format(d, "MMM d");
}

function isParentAdmin(roles = []) {
  return roles.includes("parent") && roles.includes("admin");
}

function isStudentInstructor(roles = []) {
  return roles.includes("student") && roles.includes("instructor");
}

export default function AdminChatPage() {
  // Admin participates in parent ↔ admin conversations through useChat (so
  // it gets the same optimistic send + socket lifecycle), but the *list* on
  // the left comes from the cross-conversation monitor endpoint so admin
  // can also peek at student-instructor threads in read-only mode.
  const {
    activeConvId,
    setActiveConvId,
    activeConversation,
    messages: hookMessages,
    sending,
    socketConnected,
    typingUsers,
    sendMessage,
    emitTyping,
    allConversations: parentAdminConvs,
  } = useChat(ADMIN_ID);

  const [allConvs, setAllConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showChat, setShowChat] = useState(false);

  // Read-only thread cache for student-instructor conversations the admin
  // viewer doesn't participate in. Loaded on demand when one is opened.
  const [readOnlyMessages, setReadOnlyMessages] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAllConversations()
      .then((rows) => {
        if (!cancelled) setAllConvs(Array.isArray(rows) ? rows : []);
      })
      .catch((err) =>
        console.warn("Admin all-conversations fetch failed:", err?.message)
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredConvs = useMemo(() => {
    let list = allConvs;
    if (filter === "parent_admin") {
      list = list.filter((c) => isParentAdmin(c.roles));
    } else if (filter === "student_instructor") {
      list = list.filter((c) => isStudentInstructor(c.roles));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.participants ?? []).some((p) =>
            (p ?? "").toLowerCase().includes(q)
          ) || (c.last_message ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allConvs, filter, search]);

  const stats = useMemo(() => {
    const total = allConvs.length;
    const unread = allConvs.reduce(
      (sum, c) => sum + (c.unread_count ?? 0),
      0
    );
    const today = new Date();
    const activeToday = allConvs.filter((c) => {
      if (!c.last_message_time) return false;
      return isSameDay(new Date(c.last_message_time), today);
    }).length;
    return { total, unread, activeToday };
  }, [allConvs]);

  const activeRow = allConvs.find((c) => c.conv_id === activeConvId) ?? null;
  const activeIsParentAdmin = activeRow ? isParentAdmin(activeRow.roles) : false;
  const adminParticipantConv =
    activeIsParentAdmin && activeConvId && Array.isArray(parentAdminConvs)
      ? parentAdminConvs.find((c) => c.id === activeConvId)
      : null;

  // For read-only threads, fetch messages lazily and synthesize a faux
  // "conversation" so ChatWindow can render the header consistently.
  useEffect(() => {
    if (!activeConvId || !activeRow || activeIsParentAdmin) return;
    if (readOnlyMessages[activeConvId]) return;
    getMessages(activeConvId)
      .then((msgs) => {
        setReadOnlyMessages((prev) => ({
          ...prev,
          [activeConvId]: Array.isArray(msgs) ? msgs : [],
        }));
      })
      .catch((err) =>
        console.warn("Read-only messages fetch failed:", err?.message)
      );
  }, [activeConvId, activeRow, activeIsParentAdmin, readOnlyMessages]);

  const readOnlyConversation = useMemo(() => {
    if (!activeRow || activeIsParentAdmin) return null;
    const [primary] = activeRow.participants ?? [];
    const [primaryRole] = activeRow.roles ?? [];
    return {
      id: activeRow.conv_id,
      participant_id: "—",
      participant_name: (activeRow.participants ?? []).join(" ↔ "),
      participant_role: primaryRole ?? "student",
      participant_initial: (primary ?? "?").charAt(0).toUpperCase(),
      last_message: activeRow.last_message,
      last_message_time: activeRow.last_message_time,
      unread_count: 0,
    };
  }, [activeRow, activeIsParentAdmin]);

  function handleSelect(convId) {
    setActiveConvId(convId);
    setShowChat(true);
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
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Chat Monitor
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Every conversation across the platform — admin can reply in parent
          channels, view-only elsewhere.
        </p>
      </header>

      <div className="flex h-[calc(100vh-13rem)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        {/* Left: list */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-[var(--border-color)] md:w-80 md:flex ${
            showChat ? "hidden" : "flex"
          }`}
        >
          <div className="border-b border-[var(--border-color)] px-3 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] py-2 pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors font-mono-ui ${
                      active
                        ? "border-[#10B981] bg-[#10B981]/15 text-[#10B981]"
                        : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <ul className="flex flex-col gap-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="skeleton-shimmer h-14 rounded-xl" />
                ))}
              </ul>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  No matching conversations.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {filteredConvs.map((row, i) => (
                  <ConversationRow
                    key={row.conv_id}
                    row={row}
                    active={row.conv_id === activeConvId}
                    index={i}
                    onClick={() => handleSelect(row.conv_id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Middle: chat window */}
        <section
          className={`flex-1 flex-col md:flex ${
            showChat || activeConvId ? "flex" : "hidden md:flex"
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
              {activeIsParentAdmin && adminParticipantConv ? (
                <ChatWindow
                  conversation={adminParticipantConv}
                  messages={hookMessages}
                  onSend={sendMessage}
                  sending={sending}
                  currentUserId={ADMIN_ID}
                  typingUsers={typingUsers}
                  socketConnected={socketConnected}
                  emitTyping={emitTyping}
                />
              ) : (
                <ChatWindow
                  conversation={readOnlyConversation}
                  messages={readOnlyMessages[activeConvId] ?? []}
                  onSend={() => {}}
                  currentUserId={ADMIN_ID}
                  socketConnected={socketConnected}
                  readOnly
                  readOnlyMessage="This is a student-instructor conversation. Admin view only."
                />
              )}
            </>
          ) : (
            <ChatWindow
              conversation={null}
              messages={[]}
              onSend={() => {}}
              currentUserId={ADMIN_ID}
              socketConnected={socketConnected}
            />
          )}
        </section>

        {/* Right: stats */}
        <aside className="hidden w-64 shrink-0 flex-col gap-3 border-l border-[var(--border-color)] p-4 lg:flex">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
            Monitor Stats
          </h2>
          <StatTile
            label="Total conversations"
            value={stats.total}
            tone="primary"
          />
          <StatTile label="Unread messages" value={stats.unread} tone="amber" />
          <StatTile label="Active today" value={stats.activeToday} tone="blue" />
          <p className="mt-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Admin can reply only in parent ↔ admin conversations. Student ↔
            instructor threads are read-only.
          </p>
        </aside>
      </div>
    </motion.div>
  );
}

function ConversationRow({ row, active, index, onClick }) {
  const [a, b] = row.participants ?? [];
  const [roleA, roleB] = row.roles ?? [];
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
        className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
          active
            ? "border-l-4 border-[#10B981] bg-[#10B981]/10 pl-3"
            : "border-l-4 border-transparent hover:bg-[var(--bg-secondary)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full border border-[var(--bg-card)] text-[10px] font-bold text-white ${
                ROLE_BG[roleA] ?? "bg-[#10B981]"
              }`}
            >
              {(a ?? "?").charAt(0).toUpperCase()}
            </span>
            <span
              className={`grid h-7 w-7 place-items-center rounded-full border border-[var(--bg-card)] text-[10px] font-bold text-white ${
                ROLE_BG[roleB] ?? "bg-[#3B82F6]"
              }`}
            >
              {(b ?? "?").charAt(0).toUpperCase()}
            </span>
          </span>
          <span className="ml-auto whitespace-nowrap text-[10px] text-[var(--text-muted)] font-mono-ui">
            {formatTime(row.last_message_time)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span
            className={`truncate text-sm ${
              active
                ? "font-bold text-[#10B981]"
                : "font-semibold text-[var(--text-primary)]"
            }`}
          >
            {(row.participants ?? []).join(" ↔ ") || "Conversation"}
          </span>
          <div className="flex items-center gap-2">
            <span className="line-clamp-1 flex-1 text-xs text-[var(--text-secondary)]">
              {row.last_message || (
                <span className="italic text-[var(--text-muted)]">
                  No messages yet
                </span>
              )}
            </span>
            {row.unread_count > 0 && (
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#10B981] px-1.5 text-[10px] font-bold text-white font-mono-ui">
                {row.unread_count}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-mono-ui">
            {row.message_count} message{row.message_count === 1 ? "" : "s"} ·{" "}
            {row.conv_id}
          </span>
        </div>
      </motion.button>
    </motion.li>
  );
}

function StatTile({ label, value, tone }) {
  const accent =
    tone === "primary"
      ? "text-[#10B981]"
      : tone === "amber"
      ? "text-amber-500"
      : "text-[#3B82F6]";
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold font-mono-ui ${accent}`}>
        {value}
      </p>
    </motion.div>
  );
}
