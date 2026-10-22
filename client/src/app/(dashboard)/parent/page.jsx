"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { getChildren, getStudentProgress } from "@/_lib/api/parents";
import { getPayments } from "@/_lib/api/payments";
import PaymentTable from "@/_components/payment/PaymentTable";
import { getNotifications } from "@/_lib/api/notifications";
import { useParentStore } from "@/_store/parentStore";
import { useNotificationStore } from "@/_store/notificationStore";
import { useCountUp } from "@/_hooks/useCountUp";

const CHILD_AVATAR_BG = {
  1: "#10B981",
  2: "#3B82F6",
  3: "#8B5CF6",
};

const NOTIF_TYPE_META = {
  progress_milestone: { icon: TrendingUp, color: "#22C55E" },
  course_complete: { icon: Trophy, color: "#10B981" },
  payment_success: { icon: CreditCard, color: "#3B82F6" },
  payment_failed: { icon: AlertCircle, color: "#EF4444" },
  assignment_feedback: { icon: ClipboardCheck, color: "#F59E0B" },
};

function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

export default function ParentDashboardHome() {
  const [children, setChildren] = useState([]);
  const [progress, setProgress] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadedProgress, setLoadedProgress] = useState(false);
  const { activeChildId, setActiveChild } = useParentStore();
  const { setNotifications } = useNotificationStore();
  const { data: session } = useSession();
  const pathname = usePathname();
  const hasToasted = useRef(false);

  // Welcome toast — fires once per page session as soon as the auth session
  // resolves, regardless of how the navigation got us here.
  useEffect(() => {
    if (session?.user && !hasToasted.current) {
      hasToasted.current = true;
      const fullName =
        session.user.name ||
        session.user.email?.split("@")[0] ||
        "back";
      // For "Mrs. Fatima Hassan" → "Mrs. Fatima"; single-word names pass
      // through as-is.
      const parts = fullName.trim().split(/\s+/);
      const display = parts.length > 1 ? parts.slice(0, -1).join(" ") : fullName;
      toast.success(`Welcome back, ${display}`, {
        description: `Logged in as ${fullName}`,
        duration: 3000,
      });
    }
  }, [session]);

  // Load children + parent feed once on mount / pathname change.
  useEffect(() => {
    Promise.all([
      getChildren(),
      getPayments(),
      getNotifications(),
    ])
      .then(([cs, ps, ns]) => {
        setChildren(cs);
        setPayments(ps);
        setNotifications(ns);
        if (cs.length > 0) {
          const exists = cs.some((c) => c.id === activeChildId);
          if (!exists) {
            setActiveChild(cs[0].id);
          }
        }
      })
      .catch(() => {});
  }, [setNotifications, pathname, activeChildId, setActiveChild]);

  // Fetch the active child's progress whenever they switch children.
  useEffect(() => {
    if (!activeChildId) return;
    setLoadedProgress(false);
    getStudentProgress(activeChildId)
      .then((p) => {
        setProgress(p);
        setLoadedProgress(true);
      })
      .catch(() => setLoadedProgress(true));
  }, [activeChildId]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ChildSwitcher
        children={children}
        activeId={activeChildId}
        onPick={setActiveChild}
      />

      {activeChild && <ActiveChildLabel name={activeChild.name} />}

      <StatsRow child={activeChild} />

      <CourseProgressSection
        childId={activeChildId}
        items={progress}
        loaded={loadedProgress}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentPayments items={payments} />
        <NotificationsWidget />
      </div>
    </div>
  );
}

// ── Section 1: Child switcher ─────────────────────────────────────────────

function ChildSwitcher({ children, activeId, onPick }) {
  return (
    <section>
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Parent Dashboard
      </h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Pick a child to see their progress, payments, and notifications.
      </p>

      <div className="mt-4 -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {children.length === 0
          ? Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer h-32 w-56 shrink-0 rounded-2xl"
              />
            ))
          : children.map((c, i) => (
              <ChildCard
                key={c.id}
                child={c}
                active={c.id === activeId}
                index={i}
                onClick={() => onPick(c.id)}
              />
            ))}
      </div>
    </section>
  );
}

function ChildCard({ child, active, index, onClick }) {
  const bg = CHILD_AVATAR_BG[child.id] ?? "#10B981";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      className={`relative flex w-56 shrink-0 flex-col items-start gap-2 rounded-2xl border bg-[var(--bg-card)] p-4 text-left transition-shadow ${
        active
          ? "border-[#10B981] shadow-[0_8px_24px_rgba(16,185,129,0.18)]"
          : "border-[var(--border-color)] opacity-80 hover:opacity-100"
      }`}
    >
      {active && (
        <motion.span
          layoutId="active-child-ring"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-[#10B981]"
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
        />
      )}
      <div
        className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white shadow-sm"
        style={{ backgroundColor: bg }}
      >
        {child.avatar_initial}
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-[var(--text-primary)]">
          {child.name}
        </p>
        <p className="truncate text-xs text-[var(--text-secondary)] font-mono-ui">
          Age {child.age} · {child.programme_track}
        </p>
      </div>
      <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
        {child.enrolled_courses} courses
      </span>
    </motion.button>
  );
}

// ── Section 2: Active child label ─────────────────────────────────────────

function ActiveChildLabel({ name }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={name}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="inline-flex w-fit items-center gap-2 rounded-full bg-[#10B981]/10 px-3 py-1 text-xs font-bold text-[#10B981] font-mono-ui"
      >
        Viewing: {name}
      </motion.span>
    </AnimatePresence>
  );
}

// ── Section 3: Stats row ──────────────────────────────────────────────────

function StatsRow({ child }) {
  const tiles = [
    { label: "Enrolled Courses", value: child?.enrolled_courses ?? 0, icon: BookOpen },
    { label: "Lessons Completed", value: child?.lessons_completed ?? 0, icon: CheckCircle },
    { label: "Assignments Pending", value: child?.assignments_pending ?? 0, icon: ClipboardList },
    { label: "Certificates", value: child?.certificates_count ?? 0, icon: Award },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <StatTile key={t.label} {...t} delay={i * 0.06} />
      ))}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, delay }) {
  const count = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-[#10B981]/10 text-[#10B981]">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] sm:text-sm">
        {label}
      </p>
    </motion.div>
  );
}

// ── Section 4: Course progress ────────────────────────────────────────────

function CourseProgressSection({ childId, items, loaded }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Course Progress
      </h2>
      {!loaded ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-36 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No courses enrolled yet for this child.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((it, i) => (
            <CourseProgressCard
              key={`${childId}-${it.course_id}`}
              item={it}
              index={i}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function progressMeta(progress) {
  if (progress >= 100)
    return { label: "Completed", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
  if (progress > 0)
    return { label: "In Progress", color: "#0EA5A5", bg: "rgba(14,165,165,0.12)" };
  return { label: "Not Started", color: "#6B7280", bg: "rgba(107,114,128,0.15)" };
}

function CourseProgressCard({ item, index }) {
  const meta = progressMeta(item.progress);
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
            {item.course_title}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            with {item.instructor_name}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${item.progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full bg-[#10B981]"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono-ui">
          <span>{item.progress}% Complete</span>
          <span>
            {item.modules_completed}/{item.modules_total} modules
          </span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-muted)] font-mono-ui">
          {item.last_active
            ? `Last active ${formatDistanceToNow(new Date(item.last_active), {
                addSuffix: true,
              })}`
            : "Not started yet"}
        </p>
      </div>
    </motion.article>
  );
}

// ── Section 5: Recent payments ────────────────────────────────────────────

function RecentPayments({ items }) {
  const recent = [...items]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);

  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Recent payments
        </h3>
        <Link
          href="/parent/payments"
          className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          View all →
        </Link>
      </header>

      <div className="mt-4">
        <PaymentTable payments={recent} compact loading={false} showParent={false} />
      </div>
    </section>
  );
}

function PaymentStatusBadge({ status }) {
  const styles = {
    paid: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
    pending: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
    failed: { color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  };
  const meta = styles[status] ?? styles.pending;
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      {status}
    </span>
  );
}

// ── Section 6: Notifications widget ───────────────────────────────────────

function NotificationsWidget() {
  const router = useRouter();
  const { notifications, markOneRead, unreadCount } = useNotificationStore();
  const unread = notifications.filter((n) => !n.is_read).slice(0, 3);

  function handleClick(n) {
    markOneRead(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Recent notifications
        </h3>
        <Link
          href="/parent/notifications"
          className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          View all →
        </Link>
      </header>

      {unreadCount === 0 ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#10B981]">
          <CheckCircle className="h-4 w-4" strokeWidth={2.5} />
          You&apos;re all caught up
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {unread.map((n) => (
            <NotifWidgetRow
              key={n.id}
              notification={n}
              onClick={() => handleClick(n)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NotifWidgetRow({ notification, onClick }) {
  const meta =
    NOTIF_TYPE_META[notification.type] ?? { icon: Bell, color: "#6B7280" };
  const Icon = meta.icon;
  const created = notification.created_at
    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
    : "";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-xl bg-[var(--bg-secondary)] p-3 text-left transition-colors hover:bg-[var(--bg-card)]"
      >
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {notification.title}
          </span>
          <span className="line-clamp-1 text-xs text-[var(--text-secondary)]">
            {notification.message}
          </span>
          <span className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-ui">
            {created}
          </span>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      </button>
    </li>
  );
}
