"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  X as XIcon,
  Download,
  ClipboardCheck,
  BarChart3,
  UserX,
} from "lucide-react";
import { getAdminAttendanceReport } from "@/_lib/api/sessions";
import { formatDuration } from "@/_lib/utils/sessions";

function pctColor(p) {
  if (p >= 80) return "#10B981";
  if (p >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function AdminAttendancePage() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState("");
  const [instructor, setInstructor] = useState("");
  const [range, setRange] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [nowTs, setNowTs] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setNowTs(Date.now()); // captured in state so render stays pure
    getAdminAttendanceReport()
      .then(setReport)
      .catch(() => setReport([]))
      .finally(() => setLoading(false));
  }, [pathname]);

  const courseOptions = useMemo(() => [...new Set(report.map((r) => r.course_name))], [report]);
  const instructorOptions = useMemo(() => [...new Set(report.map((r) => r.instructor_name))], [report]);

  const filtered = useMemo(() => {
    const RANGES = { week: 7 * 864e5, month: 31 * 864e5 };
    return report.filter((r) => {
      if (course && r.course_name !== course) return false;
      if (instructor && r.instructor_name !== instructor) return false;
      // Range filter only applies once we've captured a timestamp in state.
      if (range !== "all" && nowTs) {
        const age = nowTs - new Date(r.date).getTime();
        if (age > RANGES[range]) return false;
      }
      return true;
    });
  }, [report, course, instructor, range, nowTs]);

  // Summary stats.
  const summary = useMemo(() => {
    const tracked = filtered.length;
    const totalEnrolled = filtered.reduce((s, r) => s + r.enrolled_count, 0);
    const totalAttended = filtered.reduce((s, r) => s + r.attended_count, 0);
    const avg = totalEnrolled ? Math.round((totalAttended / totalEnrolled) * 100) : 0;

    // At-risk: students whose AVERAGE attendance across all sessions is < 50%.
    const perStudent = new Map();
    for (const r of filtered) {
      for (const stu of r.students) {
        if (!perStudent.has(stu.id)) perStudent.set(stu.id, []);
        perStudent.get(stu.id).push(stu.attendance_pct);
      }
    }
    let atRisk = 0;
    for (const [, pcts] of perStudent) {
      const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      if (avgPct < 50) atRisk += 1;
    }
    return { tracked, avg, atRisk };
  }, [filtered]);

  function handleExport() {
    toast.info("CSV export will be available when the backend is connected");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/sessions"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[#10B981] font-mono-ui"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Live Sessions
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-[var(--text-primary)]">Attendance Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Track student participation across all live sessions
        </p>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard icon={ClipboardCheck} color="#3B82F6" label="Sessions Tracked" value={summary.tracked} />
            <SummaryCard icon={BarChart3} color={pctColor(summary.avg)} label="Avg Attendance" value={`${summary.avg}%`} />
            <SummaryCard icon={UserX} color={summary.atRisk > 0 ? "#EF4444" : "#10B981"} label="At-Risk Students" value={summary.atRisk} />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select value={course} onChange={(e) => setCourse(e.target.value)} className={selectClass}>
              <option value="">All Courses</option>
              {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={instructor} onChange={(e) => setInstructor(e.target.value)} className={selectClass}>
              <option value="">All Instructors</option>
              {instructorOptions.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <select value={range} onChange={(e) => setRange(e.target.value)} className={selectClass}>
              <option value="all">All time</option>
              <option value="month">This month</option>
              <option value="week">This week</option>
            </select>
          </div>

          <h2 className="text-lg font-bold text-[var(--text-primary)]">Per-Session Breakdown</h2>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
              No completed sessions match these filters.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((r, i) => (
                <SessionAttendanceCard
                  key={r.session_id}
                  report={r}
                  index={i}
                  open={expanded === r.session_id}
                  onToggle={() => setExpanded(expanded === r.session_id ? null : r.session_id)}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
            >
              <Download className="h-4 w-4" /> Export All CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, color, label, value }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      </div>
    </motion.div>
  );
}

function SessionAttendanceCard({ report, index, open, onToggle }) {
  const date = new Date(report.date);
  const color = pctColor(report.attendance_pct);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm"
    >
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        {report.session_title}
      </h3>
      <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
        {report.course_name} · {report.instructor_name} · {formatDistanceToNow(date, { addSuffix: true })} · {formatDuration(report.duration_minutes)}
      </p>

      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
        Attendance: {report.attended_count}/{report.enrolled_count} students{" "}
        <span style={{ color }}>({report.attendance_pct}%)</span>
      </p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${report.attendance_pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        View Student Details
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Student</th>
                    <th className="px-3 py-2 font-semibold">Duration</th>
                    <th className="px-3 py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((stu) => {
                    const absent = stu.status === "absent";
                    return (
                      <tr key={stu.id} className="border-b border-[var(--border-color)] last:border-0">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2 text-[var(--text-primary)]">
                            {absent ? (
                              <XIcon className="h-3.5 w-3.5 text-[#EF4444]" strokeWidth={2.5} />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-[#10B981]" strokeWidth={2.5} />
                            )}
                            {stu.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] font-mono-ui">
                          {absent ? "—" : `${stu.duration_minutes} min`}
                        </td>
                        <td className="px-3 py-2 font-mono-ui font-bold" style={{ color: pctColor(stu.attendance_pct) }}>
                          {stu.attendance_pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const selectClass =
  "rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20";

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-20 w-full rounded-2xl" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}
