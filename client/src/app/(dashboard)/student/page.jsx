"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Upload,
} from "lucide-react";
import { getStudentMe } from "@/_lib/api/students";
import { getCourses } from "@/_lib/api/courses";
import { getAssignments } from "@/_lib/api/assignments";
import { getNotifications } from "@/_lib/api/notifications";
import { getSessions, getSessionCancellations } from "@/_lib/api/sessions";
import { useNotificationStore } from "@/_store/notificationStore";
import { useCountUp } from "@/_hooks/useCountUp";
import { notifyAdmin } from "@/_lib/notifications/adminNotify";
import { emitSessionNotification } from "@/_lib/notifications/sessionNotify";
import LiveSessionBanner from "@/_components/sessions/LiveSessionBanner";
import UpcomingSessionsPanel from "@/_components/sessions/UpcomingSessionsPanel";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const RECENT_ACTIVITY = [
  {
    icon: CheckCircle,
    text: "Completed: What is Scratch?",
    time: "2 hours ago",
    color: "#10B981",
  },
  {
    icon: Upload,
    text: "Submitted: Build a Simple Animation",
    time: "Yesterday",
    color: "#3B82F6",
  },
  {
    icon: Star,
    text: "Quiz passed with 67%",
    time: "2 days ago",
    color: "#F59E0B",
  },
];

const NOTIF_TYPE_META = {
  lesson_published: { icon: BookOpen, color: "#10B981" },
  assignment_feedback: { icon: ClipboardCheck, color: "#3B82F6" },
  quiz_result: { icon: Star, color: "#F59E0B" },
  course_complete: { icon: Trophy, color: "#10B981" },
  new_course: { icon: Sparkles, color: "#8B5CF6" },
  progress_milestone: { icon: TrendingUp, color: "#22C55E" },
};

export default function StudentDashboardHome() {
  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(null);

  const { setNotifications } = useNotificationStore();
  const { data: session } = useSession();
  const pathname = usePathname();
  const hasToasted = useRef(false);

  useEffect(() => {
    if (session?.user && !hasToasted.current) {
      hasToasted.current = true;
      const fullName =
        session.user.name ||
        session.user.email?.split("@")[0] ||
        "back";
      const firstName = fullName.split(" ")[0];
      toast.success(`Welcome back, ${firstName}`, {
        description: `Logged in as ${fullName}`,
        duration: 3000,
      });
      notifyAdmin("student_login", { name: fullName });
    }
  }, [session]);

  useEffect(() => {
    setNow(new Date());
    Promise.all([
      getStudentMe(),
      getCourses(),
      getAssignments(),
      getNotifications(),
    ])
      .then(([s, c, a, n]) => {
        setStudent(s);
        setCourses(c);
        setAssignments(a);
        setNotifications(n);
      })
      .finally(() => setLoaded(true));

    // Live Sessions load independently (they're a client-side mock) so the
    // banner + Online Classes panel still render even if the profile/course
    // calls to the real backend fail.
    getSessions()
      .then((sess) => {
        setSessions(sess);
        // Surface session activity in the notification bell (client-side mock,
        // de-duplicated by the emitter).
        const live = sess.find((s) => s.status === "live");
        if (live) emitSessionNotification("session_live", live, { role: "student" });
        const soon = sess
          .filter((s) => s.status === "scheduled")
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
        if (soon) {
          emitSessionNotification(
            "session_starting_soon",
            { ...soon, when: formatDistanceToNow(new Date(soon.scheduled_at), { addSuffix: true }) },
            { role: "student" }
          );
        }
      })
      .catch(() => setSessions([]));

    // Notify the student about any sessions an instructor has cancelled
    // (recorded to the shared cancellation log).
    getSessionCancellations()
      .then((log) => {
        (log ?? []).forEach((c) =>
          emitSessionNotification(
            "session_cancelled",
            { id: c.id, title: c.title, reason: c.reason },
            { role: "student" }
          )
        );
      })
      .catch(() => {});
  }, [setNotifications, pathname]);

  const pendingAssignments = assignments.filter((a) => a.status === "pending");
  const continueCourse = courses.find((c) => c.progress > 0 && c.progress < 100);
  const liveSession = sessions.find((s) => s.status === "live");

  return (
    <div className="flex flex-col gap-6">
      {/* Live Session banner — conditional, sits above all existing content. */}
      {liveSession && <LiveSessionBanner session={liveSession} />}

      <WelcomeBanner studentName={student?.name?.split(" ")[0] ?? "there"} now={now} />

      <StatsRow
        coursesCount={courses.length}
        pendingCount={pendingAssignments.length}
        lessonsCompleted={student?.lessons_completed ?? 0}
        quizAverage={student?.quiz_average ?? 0}
        loaded={loaded}
      />

      {/* Online Classes panel — after the first row of existing widgets. */}
      <UpcomingSessionsPanel sessions={sessions} />

      {continueCourse && <ContinueLearning course={continueCourse} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivity items={student?.recent_activities ?? []} />
        <UpcomingAssignments items={pendingAssignments} />
      </div>

      <NotificationsWidget />
    </div>
  );
}

function WelcomeBanner({ studentName, now }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-[var(--border-color)] p-6 sm:p-8"
      style={{
        background:
          "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.04) 60%, transparent 100%)",
      }}
    >
      <div className="relative z-10 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {now ? `Good ${getGreeting()}, ${studentName}` : `Hi, ${studentName}`}
        </h1>
        {now && (
          <p className="text-sm text-[var(--text-secondary)] sm:text-base font-mono-ui">
            {format(now, "EEEE, MMMM d, yyyy")}
          </p>
        )}
        <p className="mt-1 text-sm text-[var(--text-secondary)] sm:text-base">
          Continue your learning journey
        </p>
      </div>
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#10B981]/15 blur-3xl"
      />
    </motion.section>
  );
}

function StatsRow({ coursesCount, pendingCount, lessonsCompleted, quizAverage, loaded }) {
  const tiles = [
    { label: "Enrolled Courses", value: loaded ? coursesCount : 0, icon: BookOpen },
    { label: "Lessons Completed", value: loaded ? lessonsCompleted : 0, icon: CheckCircle },
    { label: "Assignments Pending", value: loaded ? pendingCount : 0, icon: ClipboardList },
    { label: "Quiz Average", value: loaded ? quizAverage : 0, suffix: "%", icon: Star },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <StatTile key={t.label} {...t} delay={i * 0.06} />
      ))}
    </div>
  );
}

function StatTile({ label, value, suffix, icon: Icon, delay }) {
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
        <span className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{count}</span>
        {suffix && <span className="text-lg font-bold text-[var(--text-primary)]">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] sm:text-sm">{label}</p>
    </motion.div>
  );
}

function ContinueLearning({ course }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#10B981] font-mono-ui">
            Continue learning
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">{course.title}</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            with {course.instructor_name}
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
          {course.module_count} modules
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
          <span>{course.progress}% complete</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${course.progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full bg-[#10B981]"
          />
        </div>
      </div>

      <Link
        href={`/student/courses/${course.id}`}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        Continue Learning <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.section>
  );
}

function RecentActivity({ items }) {
  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Recent activity</h3>
      {!items || items.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">No recent activity.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((a, i) => {
            const Icon = a.type === "grade" ? CheckCircle : a.type === "submission" ? Upload : Star;
            let timeStr = "Recent";
            if (a.time) {
              try {
                timeStr = formatDistanceToNow(new Date(a.time), { addSuffix: true });
              } catch {
                timeStr = a.time;
              }
            }
            return (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border-l-2 bg-[var(--bg-secondary)] px-3 py-2.5"
                style={{ borderLeftColor: a.color }}
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: a.color }}
                  strokeWidth={2.2}
                />
                <div className="flex flex-col">
                  <span className="text-sm text-[var(--text-primary)]">{a.text}</span>
                  <span className="text-xs text-[var(--text-muted)] font-mono-ui">{timeStr}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UpcomingAssignments({ items }) {
  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Upcoming assignments</h3>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          No pending assignments — nice work.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((a) => (
            <UpcomingAssignmentRow key={a.id} item={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function deadlineMeta(deadline) {
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 3) return { color: "#EF4444", bg: "rgba(239,68,68,0.12)", label: `${days}d left` };
  if (days < 7) return { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: `${days}d left` };
  return { color: "#10B981", bg: "rgba(16,185,129,0.12)", label: `${days}d left` };
}

function UpcomingAssignmentRow({ item }) {
  const meta = deadlineMeta(item.deadline);
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-secondary)] p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">due {item.deadline}</p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold font-mono-ui"
        style={{ color: meta.color, backgroundColor: meta.bg }}
      >
        {meta.label}
      </span>
      <Link
        href="/student/assignments"
        className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card)]"
      >
        View
      </Link>
    </li>
  );
}

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
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Recent notifications</h3>
        <Link
          href="/student/notifications"
          className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          View all
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
            <NotifWidgetRow key={n.id} notification={n} onClick={() => handleClick(n)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NotifWidgetRow({ notification, onClick }) {
  const meta = NOTIF_TYPE_META[notification.type] ?? { icon: Bell, color: "#6B7280" };
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
          <span className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-ui">{created}</span>
        </div>
      </button>
    </li>
  );
}
