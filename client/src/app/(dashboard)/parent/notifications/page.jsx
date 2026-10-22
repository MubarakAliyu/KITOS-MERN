"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bell,
  BellOff,
  ClipboardCheck,
  CreditCard,
  MessageSquare,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { getNotifications } from "@/_lib/api/notifications";
import { useNotificationStore } from "@/_store/notificationStore";

// User ID resolved via session context.

const TYPE_META = {
  progress_milestone: { icon: TrendingUp, color: "#22C55E" },
  course_complete: { icon: Trophy, color: "#10B981" },
  payment_success: { icon: CreditCard, color: "#3B82F6" },
  payment_failed: { icon: AlertCircle, color: "#EF4444" },
  assignment_feedback: { icon: ClipboardCheck, color: "#F59E0B" },
  new_message: { icon: MessageSquare, color: "#3B82F6" },
};

const TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "progress", label: "Progress" },
  { key: "payments", label: "Payments" },
  { key: "messages", label: "Messages" },
];

const TAB_FILTERS = {
  all: () => true,
  unread: (n) => !n.is_read,
  progress: (n) =>
    n.type === "progress_milestone" ||
    n.type === "course_complete" ||
    n.type === "assignment_feedback",
  payments: (n) =>
    n.type === "payment_success" || n.type === "payment_failed",
  messages: (n) => n.type === "new_message",
};

export default function ParentNotificationsPage() {
  const router = useRouter();
  const { notifications, setNotifications, markAllRead, markOneRead } =
    useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    getNotifications()
      .then((list) => setNotifications(list))
      .catch((err) => {
        console.warn("Notifications fetch failed:", err.message);
        setError("Failed to load notifications. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [setNotifications, pathname]);

  const visible = useMemo(
    () => notifications.filter(TAB_FILTERS[tab]),
    [notifications, tab]
  );

  function handleClick(n) {
    markOneRead(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Notifications
        </h1>
        {notifications.some((n) => !n.is_read) && (
          <button
            type="button"
            onClick={markAllRead}
            className="self-start rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] sm:self-auto font-mono-ui"
          >
            Mark all as read
          </button>
        )}
      </header>

      <nav
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition-colors font-mono-ui ${
                active
                  ? "text-[#10B981]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="parent-notif-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-[#10B981]"
                  transition={{ type: "spring", stiffness: 280, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        <EmptyTab tab={tab} />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((n, i) => (
            <NotificationRow
              key={n.id}
              notification={n}
              index={i}
              onClick={() => handleClick(n)}
            />
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function NotificationRow({ notification, index, onClick }) {
  const meta = TYPE_META[notification.type] ?? { icon: Bell, color: "#6B7280" };
  const Icon = meta.icon;
  const created = notification.created_at
    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
    : "";

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-4 rounded-2xl border border-l-4 px-4 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)] ${
          notification.is_read
            ? "border-[var(--border-color)] border-l-transparent bg-[var(--bg-card)]"
            : "border-[var(--border-color)] border-l-[#10B981] bg-[#10B981]/[0.05]"
        }`}
      >
        <span
          className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`truncate text-sm ${
              !notification.is_read
                ? "font-bold text-[var(--text-primary)]"
                : "font-medium text-[var(--text-primary)]"
            }`}
          >
            {notification.title}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            {notification.message}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-mono-ui">
            {created}
          </span>
        </div>
        {!notification.is_read && (
          <span
            aria-hidden="true"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#10B981]"
          />
        )}
      </button>
    </motion.li>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
      >
        Refresh page
      </button>
    </div>
  );
}

function EmptyTab({ tab }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <BellOff className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        No notifications in{" "}
        <span className="font-semibold text-[var(--text-primary)]">{tab}</span>.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-20 rounded-2xl" />
      ))}
    </div>
  );
}
