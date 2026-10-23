"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  BookOpen,
  ClipboardCheck,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  UserPlus,
  CreditCard,
  UserCheck,
  Users,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  Upload,
  Radio,
  Clock,
  CalendarX,
  PlayCircle,
  Video,
} from "lucide-react";
import { useNotificationStore } from "@/_store/notificationStore";
import { useLanguage } from "@/_lib/i18n/LanguageContext";

// Maps Notification.type → { icon, color }. Falls back to a neutral bell.
const TYPE_META = {
  // Student / Parent academic types
  lesson_published: { icon: BookOpen, color: "#10B981" },
  assignment_feedback: { icon: ClipboardCheck, color: "#3B82F6" },
  quiz_result: { icon: Star, color: "#F59E0B" },
  course_complete: { icon: Trophy, color: "#10B981" },
  new_course: { icon: Sparkles, color: "#8B5CF6" },
  progress_milestone: { icon: TrendingUp, color: "#22C55E" },

  // Admin types
  new_enrollment: { icon: UserPlus, color: "#10B981" },
  payment_received: { icon: CreditCard, color: "#22C55E" },
  payment_made: { icon: CreditCard, color: "#22C55E" },
  course_created: { icon: BookOpen, color: "#3B82F6" },
  user_joined: { icon: UserCheck, color: "#8B5CF6" },
  child_registered: { icon: Users, color: "#F59E0B" },
  account_created: { icon: CheckCircle, color: "#10B981" },
  student_login: { icon: UserCheck, color: "#3B82F6" },
  assignment_submitted: { icon: BookOpen, color: "#F59E0B" },
  quiz_completed: { icon: CheckCircle, color: "#10B981" },
  new_message: { icon: MessageSquare, color: "#3B82F6" },

  // Instructor types
  student_enrolled: { icon: UserPlus, color: "#22C55E" },
  course_message: { icon: MessageSquare, color: "#3B82F6" },

  // Live Session types
  session_live: { icon: Radio, color: "#DC2626" },
  session_starting_soon: { icon: Clock, color: "#F59E0B" },
  session_cancelled: { icon: CalendarX, color: "#EF4444" },
  session_recording_added: { icon: PlayCircle, color: "#10B981" },
  session_scheduled: { icon: Video, color: "#3B82F6" },

  // Parent specific payment types
  payment_success: { icon: CreditCard, color: "#3B82F6" },
  payment_failed: { icon: AlertCircle, color: "#EF4444" },
};

function metaFor(type) {
  return TYPE_META[type] ?? { icon: Bell, color: "#6B7280" };
}

export default function NotificationDropdown({ onClose }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { notifications, markAllRead, markOneRead } = useNotificationStore();
  const { t } = useLanguage();
  const hasItems = notifications.length > 0;

  const role = session?.user?.role;
  const notificationsHref = role ? `/${role}/notifications` : "/student/notifications";

  function handleItemClick(n) {
    markOneRead(n.id);
    onClose?.();
    if (n.link) router.push(n.link);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-50 mt-2 w-[360px] origin-top-right overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
        <h2 className="font-sans text-base font-semibold text-[var(--text-primary)]">
          {t("notifications.notifications")}
        </h2>
        {hasItems && (
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-md px-2 py-1 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 font-mono-ui"
          >
            {t("common.markAllRead")}
          </button>
        )}
      </header>

      <div className="max-h-[420px] overflow-y-auto">
        {hasItems ? (
          <ul className="flex flex-col">
            {notifications.slice(0, 8).map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onClick={() => handleItemClick(n)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </div>

      <Link
        href={notificationsHref}
        onClick={onClose}
        className="block border-t border-[var(--border-color)] px-4 py-2.5 text-center text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 font-mono-ui"
      >
        {t("common.viewAll")}
      </Link>
    </motion.div>
  );
}

function NotificationItem({ notification, onClick }) {
  const meta = metaFor(notification.type);
  const Icon = meta.icon;
  const color = meta.color;
  const created = notification.created_at
    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
    : "";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)] ${
          !notification.is_read
            ? "border-l-[#10B981] bg-[#10B981]/[0.06]"
            : "border-l-transparent"
        }`}
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `${color}1F`, color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`truncate text-sm ${
              !notification.is_read ? "font-bold text-[var(--text-primary)]" : "font-medium text-[var(--text-primary)]"
            }`}
          >
            {notification.title}
          </span>
          <span className="line-clamp-2 text-xs text-[var(--text-secondary)]">
            {notification.message}
          </span>
          {created && (
            <span className="text-[11px] text-[var(--text-muted)] font-mono-ui">
              {created}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <BellOff className="h-6 w-6" strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        {t("notifications.allCaughtUp")}
      </p>
    </div>
  );
}
