"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Search, Users } from "lucide-react";
import {
  getInstructorCourses,
  getInstructorStudents,
} from "@/_lib/api/instructor";
import StudentDetailPanel from "@/_components/instructor/StudentDetailPanel";

function quizScoreColor(score) {
  if (score >= 90) return "#22C55E";
  if (score >= 70) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function InstructorStudentsPage() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getInstructorStudents(), getInstructorCourses()])
      .then(([ss, cs]) => {
        setStudents(ss);
        setCourses(cs);
      })
      .catch((err) => {
        console.warn("Students fetch failed:", err.message);
        setError("Failed to load students. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (courseFilter !== "all" && !s.enrolled_courses.includes(courseFilter))
        return false;
      return true;
    });
  }, [students, query, courseFilter]);

  const opened = students.find((s) => s.id === openId) ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            My Students
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Filter and inspect each learner&apos;s performance.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        >
          <option value="all">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <tr>
                <Th>Student</Th>
                <Th>Admission No</Th>
                <Th>Age</Th>
                <Th>Track</Th>
                <Th>Courses</Th>
                <Th>Quiz Avg</Th>
                <Th>Assignments</Th>
                <Th>Last Active</Th>
                <Th align="right">Details</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <StudentRow key={s.id} student={s} onView={() => setOpenId(s.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentDetailPanel student={opened} onClose={() => setOpenId(null)} />
    </motion.div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-[10px] font-bold uppercase tracking-wider font-mono-ui`}
    >
      {children}
    </th>
  );
}

function StudentRow({ student, onView }) {
  return (
    <tr className="border-b border-[var(--border-color)] last:border-b-0 transition-colors hover:bg-[var(--bg-secondary)]/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#10B981] text-xs font-bold text-white">
            {student.avatar_initial}
          </div>
          <span className="truncate font-semibold text-[var(--text-primary)]">
            {student.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {student.admission_no ? (
          <span className="font-mono text-xs font-semibold text-[#10B981]">
            {student.admission_no}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)] font-mono-ui">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--text-primary)] font-mono-ui">
        {student.age}
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
          {student.programme_track}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)] font-mono-ui">
          {student.enrolled_courses.length}
        </span>
      </td>
      <td
        className="px-4 py-3 font-bold font-mono-ui"
        style={{ color: quizScoreColor(student.quiz_average) }}
      >
        {student.quiz_average}%
      </td>
      <td className="px-4 py-3 text-[var(--text-secondary)] font-mono-ui">
        {student.assignments_completed} done · {student.assignments_pending} pending
      </td>
      <td className="px-4 py-3 text-[var(--text-muted)] font-mono-ui">
        {student.last_active
          ? formatDistanceToNow(new Date(student.last_active), { addSuffix: true })
          : "Never"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onView}
          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          View
        </button>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Users className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        No students match your filters.
      </p>
    </div>
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
