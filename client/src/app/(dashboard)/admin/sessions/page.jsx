"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  Radio,
  Clock,
  CheckCircle,
  BarChart3,
  AlertTriangle,
  Search,
  ArrowRight,
  Users,
} from "lucide-react";
import { getAdminSessionsOverview, getAdminAllSessions, getSessionCancellations } from "@/_lib/api/sessions";
import { formatDuration, minutesSince, minutesRemaining } from "@/_lib/utils/sessions";
import { emitSessionNotification } from "@/_lib/notifications/sessionNotify";
import { useCountUp } from "@/_hooks/useCountUp";
import SessionStatusBadge from "@/_components/sessions/SessionStatusBadge";

// Friendly date: "Today 2:00 PM" / "Tomorrow 10:00 AM" / "Mon, Jul 7 · 11:00 AM".
function friendlyDateTime(iso) {
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today ${time}`;
  if (isTomorrow(d)) return `Tomorrow ${time}`;
  if (isYesterday(d)) return `Yesterday ${time}`;
  return `${format(d, "MMM d")} · ${time}`;
}

export default function AdminSessionsPage() {
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const [status, setStatus] = useState("all");
  const [instructorId, setInstructorId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [search, setSearch] = useState("");

  const tableRef = useRef(null);

  // Overview (stats + filter option sources) loads once.
  useEffect(() => {
    setLoading(true);
    getAdminSessionsOverview()
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));

    // Notify the admin about instructor-cancelled sessions (shared log).
    getSessionCancellations()
      .then((log) => {
        (log ?? []).forEach((c) =>
          emitSessionNotification(
            "session_cancelled",
            { id: c.id, title: c.title, reason: c.reason },
            { role: "admin" }
          )
        );
      })
      .catch(() => {});
  }, [pathname]);

  // Filtered list re-fetches whenever a filter changes.
  useEffect(() => {
    getAdminAllSessions({
      status,
      instructor_id: instructorId || undefined,
      course_name: courseName || undefined,
      search: search || undefined,
    })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [status, instructorId, courseName, search]);

  const liveSessions = useMemo(
    () => (overview?.sessions ?? []).filter((s) => s.status === "live"),
    [overview]
  );

  function scrollToTable() {
    setStatus("completed");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Live Sessions Overview</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Monitor all sessions across the platform
        </p>
      </header>

      {loading || !overview ? (
        <OverviewSkeleton />
      ) : (
        <>
          <StatCards stats={overview.stats} onMissingClick={scrollToTable} />

          {liveSessions.length > 0 && <LiveNowSection sessions={liveSessions} />}

          <section ref={tableRef} className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">All Sessions</h2>

            <Filters
              status={status}
              setStatus={setStatus}
              instructorId={instructorId}
              setInstructorId={setInstructorId}
              courseName={courseName}
              setCourseName={setCourseName}
              search={search}
              setSearch={setSearch}
              instructors={overview.instructors}
              courses={overview.courses}
            />

            <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} found
            </p>

            <SessionsTable sessions={sessions} />
          </section>
        </>
      )}
    </div>
  );
}

// ── Stat cards ───────────────────────────────────────────────────────────

function StatCards({ stats, onMissingClick }) {
  const tiles = [
    { label: "Live Now", value: stats.live_now, icon: Radio, color: "#DC2626", pulse: stats.live_now > 0 },
    { label: "Upcoming", value: stats.upcoming, icon: Clock, color: "#F59E0B" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "#10B981" },
    { label: "Total Sessions", value: stats.total_sessions, icon: BarChart3, color: "#3B82F6" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <StatTile key={t.label} {...t} delay={i * 0.06} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AttendanceTile pct={stats.avg_attendance_pct} />
        <MissingRecordingsTile count={stats.missing_recordings} onClick={onMissingClick} />
      </div>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, color, pulse, delay }) {
  const count = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
    >
      <div className="grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: `${color}1a`, color }}>
        {pulse ? <span className="live-dot" aria-hidden="true" /> : <Icon className="h-5 w-5" strokeWidth={2.2} />}
      </div>
      <p className="mt-3 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{count}</p>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] sm:text-sm">{label}</p>
    </motion.div>
  );
}

function AttendanceTile({ pct }) {
  const color = pct >= 75 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
  const count = useCountUp(pct);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text-secondary)]">Avg Attendance</p>
        <span className="text-2xl font-bold font-mono-ui" style={{ color }}>{count}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </motion.div>
  );
}

function MissingRecordingsTile({ count, onClick }) {
  const has = count > 0;
  return (
    <motion.button
      type="button"
      onClick={has ? onClick : undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={`flex flex-col gap-1 rounded-2xl border p-5 text-left shadow-sm transition-colors ${
        has
          ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 cursor-pointer"
          : "border-[#10B981]/40 bg-[#10B981]/10 cursor-default"
      }`}
    >
      <div className="flex items-center gap-2">
        {has ? (
          <AlertTriangle className="h-5 w-5 text-amber-500" strokeWidth={2.2} />
        ) : (
          <CheckCircle className="h-5 w-5 text-[#10B981]" strokeWidth={2.2} />
        )}
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {has ? "Missing Recordings" : "All Recordings Uploaded"}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {has
          ? `${count} completed session${count === 1 ? "" : "s"} ${count === 1 ? "has" : "have"} no recording`
          : "Every completed session has a recording ✓"}
      </p>
      {has && (
        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 font-mono-ui">
          View <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </motion.button>
  );
}

// ── Live now ─────────────────────────────────────────────────────────────

function LiveNowSection({ sessions }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
        <span className="live-dot" aria-hidden="true" /> Currently Live
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-2 rounded-2xl border p-5"
            style={{ borderColor: "rgba(220,38,38,0.35)", background: "linear-gradient(135deg, rgba(220,38,38,0.1), transparent)" }}
          >
            <div className="flex items-center gap-2">
              <SessionStatusBadge status="live" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">{s.title}</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] font-mono-ui">
              {s.course_name} · {s.instructor_name}
            </p>
            <p className="text-xs text-[#DC2626] font-mono-ui">
              Started {minutesSince(s.scheduled_at)} min ago ·{" "}
              {minutesRemaining(s.scheduled_at, s.duration_minutes)} min remaining
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono-ui">
              <Users className="h-3.5 w-3.5" /> {s.attended_count} of {s.enrolled_count} students joined
            </p>
            <Link
              href={`/admin/sessions/${s.id}`}
              className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
            >
              View Details <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────

function Filters({
  status, setStatus, instructorId, setInstructorId, courseName, setCourseName,
  search, setSearch, instructors, courses,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex-1">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="all">All Statuses</option>
          <option value="live">Live</option>
          <option value="scheduled">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className={selectClass}>
          <option value="">All Instructors</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select value={courseName} onChange={(e) => setCourseName(e.target.value)} className={selectClass}>
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="relative lg:w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions…"
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
      </div>
    </div>
  );
}

const selectClass =
  "rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20";

// ── Table ────────────────────────────────────────────────────────────────

function SessionsTable({ sessions }) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
        No sessions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-left text-xs uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
          <tr>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Session</th>
            <th className="px-4 py-3 font-semibold">Course</th>
            <th className="px-4 py-3 font-semibold">Instructor</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Enrolled</th>
            <th className="px-4 py-3 font-semibold">Attended</th>
            <th className="px-4 py-3 font-semibold">Recording</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              onClick={() => router.push(`/admin/sessions/${s.id}`)}
              className="cursor-pointer border-b border-[var(--border-color)] transition-colors last:border-b-0 hover:bg-[var(--bg-secondary)]/50"
            >
              <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)] font-mono-ui">
                {friendlyDateTime(s.scheduled_at)}
              </td>
              <td className="px-4 py-3">
                <span className="font-semibold text-[var(--text-primary)]">{s.title}</span>
                {s.session_number != null && (
                  <span className="ml-1 text-xs text-[var(--text-muted)] font-mono-ui">· Wk {s.session_number}</span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{s.course_name}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{s.instructor_name}</td>
              <td className="px-4 py-3"><SessionStatusBadge status={s.status} /></td>
              <td className="px-4 py-3 text-[var(--text-secondary)] font-mono-ui">{s.enrolled_count}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)] font-mono-ui">
                {s.status === "completed" ? s.attended_count : "—"}
              </td>
              <td className="px-4 py-3"><RecordingCell session={s} /></td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/sessions/${s.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordingCell({ session }) {
  if (session.status !== "completed") {
    return <span className="text-[var(--text-muted)] font-mono-ui">—</span>;
  }
  return session.recording_url ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#10B981] font-mono-ui">
      <CheckCircle className="h-3.5 w-3.5" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 font-mono-ui">
      <AlertTriangle className="h-3.5 w-3.5" /> Missing
    </span>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="skeleton-shimmer h-10 w-10 rounded-full" />
            <div className="skeleton-shimmer mt-3 h-7 w-12 rounded" />
            <div className="skeleton-shimmer mt-2 h-3 w-20 rounded" />
          </div>
        ))}
      </div>
      <div className="skeleton-shimmer h-64 w-full rounded-2xl" />
    </div>
  );
}
