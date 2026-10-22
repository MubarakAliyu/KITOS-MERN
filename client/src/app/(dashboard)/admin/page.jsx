"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  BookOpen,
  CreditCard,
  GraduationCap,
  Megaphone,
  Minus,
  Plus,
  Star,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  getAdminAnalytics,
  getAdminCourses,
  getAdminStats,
  getAdminUsers,
  getPendingEnrollments,
} from "@/_lib/api/admin";
import { getNotifications } from "@/_lib/api/notifications";
import { getPaymentStats } from "@/_lib/api/payments";
import { useNotificationStore } from "@/_store/notificationStore";
import { useCountUp } from "@/_hooks/useCountUp";
import CreateUserModal from "@/_components/admin/CreateUserModal";
import CreateCourseModal from "@/_components/admin/CreateCourseModal";
import AnnouncementModal from "@/_components/admin/AnnouncementModal";
import AdminSessionsWidget from "@/_components/sessions/AdminSessionsWidget";

function formatNaira(n) {
  return `₦${Number(n).toLocaleString("en-NG")}`;
}

export default function AdminDashboardHome() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const [openCreateUser, setOpenCreateUser] = useState(false);
  const [openCreateCourse, setOpenCreateCourse] = useState(false);
  const [openAnnouncement, setOpenAnnouncement] = useState(false);
  const [createUserDefaults, setCreateUserDefaults] = useState(null);

  const { setNotifications } = useNotificationStore();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const hasToasted = useRef(false);

  useEffect(() => {
    if (session?.user && !hasToasted.current) {
      hasToasted.current = true;
      toast.success("Welcome back, Admin", { duration: 3000 });
    }
  }, [session]);

  useEffect(() => {
    setError(null);
    Promise.all([
      getAdminStats(),
      getAdminAnalytics(),
      getPendingEnrollments(),
      getAdminUsers(),
      getAdminCourses(),
      // No id: the API returns the signed-in user's own feed. It used to pass
      // "admin1", the mock fixtures' key, which is not an ObjectId and 400s
      // against the real API.
      getNotifications(),
      getPaymentStats().catch(() => null),
    ])
      .then(([s, a, pe, u, c, n, ps]) => {
        // Prefer live payment stats for revenue — admin/stats is mostly user
        // counts; payments/stats is the source of truth for revenue.
        const merged = ps
          ? {
              ...s,
              total_revenue: ps.total_revenue,
              this_month_revenue: ps.this_month,
              last_month_revenue: ps.last_month,
            }
          : s;
        setStats(merged);
        setAnalytics(a);
        setPending(pe);
        setUsers(u);
        setCourses(c?.courses ?? c ?? []);
        setNotifications(n);
      })
      .catch((err) => {
        console.warn("Admin dashboard fetch failed:", err.message);
        setError("Failed to load dashboard. Please refresh.");
      });
  }, [setNotifications, pathname]);

  const instructors = useMemo(
    () => users.filter((u) => u.role === "instructor"),
    [users]
  );

  function handleProvisioned(created, pendingId) {
    setUsers((prev) => [created, ...prev]);
    if (pendingId) setPending((prev) => prev.filter((p) => p.id !== pendingId));
    setCreateUserDefaults(null);
  }

  function openProvisionFor(p) {
    setCreateUserDefaults({
      pending_id: p.id,
      role: "student",
      name: p.child_name,
      age: p.age,
      programme_track: p.programme_track,
    });
    setOpenCreateUser(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Platform-wide visibility and quick actions.
        </p>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : (
        <>
          <KPIRow stats={stats} />

          {pending.length > 0 && (
            <PendingEnrollmentsBlock items={pending} onProvision={openProvisionFor} />
          )}

          <ChartsRowOne analytics={analytics} />
          <ChartsRowTwo analytics={analytics} />

          <QuickActionsRow
            onAddUser={() => {
              setCreateUserDefaults(null);
              setOpenCreateUser(true);
            }}
            onAddCourse={() => setOpenCreateCourse(true)}
            onSendAnnouncement={() => setOpenAnnouncement(true)}
            onViewAnalytics={() => router.push("/admin/analytics")}
          />

          <RecentActivity />

          <AdminSessionsWidget />
        </>
      )}

      <CreateUserModal
        isOpen={openCreateUser}
        onClose={() => setOpenCreateUser(false)}
        onCreated={(c) =>
          handleProvisioned(c, createUserDefaults?.pending_id)
        }
        defaultValues={createUserDefaults}
      />
      <CreateCourseModal
        isOpen={openCreateCourse}
        onClose={() => setOpenCreateCourse(false)}
        instructors={instructors}
        onCreated={(c) => setCourses((prev) => [c, ...prev])}
      />
      <AnnouncementModal
        isOpen={openAnnouncement}
        onClose={() => setOpenAnnouncement(false)}
        courses={courses}
      />
    </motion.div>
  );
}

// ── KPI row ──────────────────────────────────────────────────────────────

function KPIRow({ stats }) {
  const tiles = [
    { label: "Total Students", value: stats?.total_students ?? 0, change: stats?.students_change ?? 0, icon: Users },
    { label: "Total Revenue", value: stats?.total_revenue ?? 0, change: stats?.revenue_change ?? 0, icon: TrendingUp, currency: true },
    { label: "Active Courses", value: stats?.total_courses ?? 0, change: stats?.courses_change ?? 0, icon: BookOpen },
    { label: "Instructors", value: stats?.total_instructors ?? 0, change: stats?.instructors_change ?? 0, icon: GraduationCap },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <KPITile key={t.label} {...t} delay={i * 0.08} />
      ))}
    </div>
  );
}

function KPITile({ label, value, change, icon: Icon, currency, delay }) {
  const count = useCountUp(value);
  const display = currency ? formatNaira(count) : count.toLocaleString();
  const ChangeIcon = change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus;
  const changeColor =
    change > 0 ? "#10B981" : change < 0 ? "#EF4444" : "var(--text-muted)";
  const changeLabel =
    change > 0 ? `+${change}% this month` : change < 0 ? `${change}% this month` : "No change";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-[#10B981]/10 text-[#10B981]">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <p className="mt-3 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
        {display}
      </p>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] sm:text-sm">
        {label}
      </p>
      <p
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold font-mono-ui"
        style={{ color: changeColor }}
      >
        <ChangeIcon className="h-3 w-3" strokeWidth={3} />
        {changeLabel}
      </p>
    </motion.div>
  );
}

// ── Pending enrollments ──────────────────────────────────────────────────

function PendingEnrollmentsBlock({ items, onProvision }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={2.2} />
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          {items.length} enrollment{items.length === 1 ? "" : "s"} awaiting account creation
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                  {p.child_name}
                </p>
                <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
                  Age {p.age} · {p.programme_track}
                </p>
              </div>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono-ui">
                Pending
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono-ui">
              {p.parent_name} · {p.parent_email}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
              Requested{" "}
              {formatDistanceToNow(new Date(p.requested_at), { addSuffix: true })}
            </p>
            <button
              type="button"
              onClick={() => onProvision(p)}
              className="mt-1 self-start rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#059669]"
            >
              Create Account →
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Chart rows ───────────────────────────────────────────────────────────

function ChartsRowOne({ analytics }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Student Enrollment Trend">
        <div style={{ width: "100%", height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={analytics?.enrollment_trend ?? []}
              margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
            >
              <defs>
                <linearGradient id="enrollGradHome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={32} />
              <Tooltip content={<EnrollTooltip />} />
              <Area
                type="monotone"
                dataKey="students"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#enrollGradHome)"
                animationBegin={0}
                animationDuration={1200}
                dot={{ fill: "#10B981", r: 4 }}
                activeDot={{ r: 6, fill: "#059669" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Monthly Revenue">
        <div style={{ width: "100%", height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics?.revenue_monthly ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={48} />
              <Tooltip content={<RevenueTooltip />} cursor={{ fill: "rgba(16,185,129,0.06)" }} />
              <Bar dataKey="subscription" stackId="rev" fill="#10B981" animationDuration={1200} />
              <Bar dataKey="one_time" stackId="rev" fill="#1a2234" radius={[6, 6, 0, 0]} animationDuration={1200} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </section>
  );
}

function ChartsRowTwo({ analytics }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Course Completion Rates">
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={analytics?.course_completion ?? []} margin={{ top: 8, right: 32, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis type="category" dataKey="course" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={70} />
              <Tooltip cursor={{ fill: "rgba(16,185,129,0.06)" }} formatter={(v) => [`${v}%`, "Completion"]} />
              <Bar dataKey="rate" radius={[0, 6, 6, 0]} animationDuration={1200}>
                {(analytics?.course_completion ?? []).map((entry, i) => (
                  <Cell key={i} fill={completionColor(entry.rate)} />
                ))}
                <LabelList dataKey="rate" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "var(--text-secondary)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Average Quiz Scores Over Time">
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics?.quiz_performance ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={36} />
              <Tooltip formatter={(v) => [`${v}%`, "Avg score"]} />
              <ReferenceLine y={70} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "Target 70%", fill: "#F59E0B", fontSize: 10, position: "right" }} />
              <ReferenceLine y={90} stroke="#10B981" strokeDasharray="4 4" label={{ value: "Excellent 90%", fill: "#10B981", fontSize: 10, position: "right" }} />
              <Line type="monotone" dataKey="average" stroke="#10B981" strokeWidth={3} dot={{ fill: "#10B981", r: 5, strokeWidth: 2, stroke: "white" }} activeDot={{ r: 7, fill: "#059669" }} animationDuration={1200} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </section>
  );
}

function completionColor(v) {
  if (v >= 70) return "#10B981";
  if (v >= 40) return "#F59E0B";
  return "#EF4444";
}

function EnrollTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p className="text-sm font-bold text-[#10B981] font-mono-ui">
        {payload[0].value} students enrolled
      </p>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="min-w-[10rem] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 text-xs font-mono-ui">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="text-[var(--text-primary)]">{formatNaira(p.value)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-[var(--border-color)] pt-1.5 text-xs font-bold font-mono-ui">
        <span className="text-[var(--text-secondary)]">Total</span>
        <span className="text-[#10B981]">{formatNaira(total)}</span>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function QuickActionsRow({ onAddUser, onAddCourse, onSendAnnouncement, onViewAnalytics }) {
  const buttons = [
    { label: "Add User", icon: Plus, onClick: onAddUser },
    { label: "Add Course", icon: BookOpen, onClick: onAddCourse },
    { label: "Send Announcement", icon: Megaphone, onClick: onSendAnnouncement },
    { label: "View Analytics", icon: BarChart2, onClick: onViewAnalytics },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {buttons.map(({ label, icon: Icon, onClick }) => (
        <motion.button
          key={label}
          type="button"
          onClick={onClick}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
          {label}
        </motion.button>
      ))}
    </section>
  );
}

function RecentActivity() {
  const { notifications } = useNotificationStore();
  
  function getIconAndColor(text) {
    const t = text.toLowerCase();
    if (t.includes("payment") || t.includes("₦") || t.includes("paid") || t.includes("revenue")) {
      return { icon: CreditCard, color: "#22C55E" };
    }
    if (t.includes("enroll") || t.includes("student") || t.includes("register")) {
      return { icon: UserPlus, color: "#10B981" };
    }
    if (t.includes("course") || t.includes("publish")) {
      return { icon: BookOpen, color: "#3B82F6" };
    }
    if (t.includes("announcement") || t.includes("megaphone") || t.includes("broadcast")) {
      return { icon: Megaphone, color: "#EF4444" };
    }
    return { icon: UserCheck, color: "#8B5CF6" };
  }

  const recentItems = notifications.slice(0, 5);

  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Recent Activity
      </h2>
      {recentItems.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)] font-mono-ui">
          No recent activity logs.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {recentItems.map((a, i) => {
            const { icon: Icon, color } = getIconAndColor(a.message);
            let timeStr = "";
            try {
              timeStr = formatDistanceToNow(new Date(a.created_at), { addSuffix: true });
            } catch (err) {
              timeStr = a.created_at;
            }
            return (
              <motion.li
                key={a.id || i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.08 }}
                className="flex items-start gap-3 rounded-xl bg-[var(--bg-secondary)] p-3"
              >
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm text-[var(--text-primary)]">{a.message}</span>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                    {timeStr}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
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
