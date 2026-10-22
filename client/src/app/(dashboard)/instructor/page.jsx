"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart2,
  BookOpen,
  ClipboardList,
  Layers,
  Users,
} from "lucide-react";
import {
  getInstructorAssignments,
  getInstructorCourses,
  getInstructorProfile,
  getInstructorStudents,
} from "@/_lib/api/instructor";
import { getNotifications } from "@/_lib/api/notifications";
import { useNotificationStore } from "@/_store/notificationStore";
import { useCountUp } from "@/_hooks/useCountUp";
import AssignmentReviewModal from "@/_components/instructor/AssignmentReviewModal";

// Drops the surname so "Ms. Sarah Aliyu" → "Ms. Sarah". Single-word names
// fall through unchanged.
function shortName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  return parts.slice(0, -1).join(" ");
}

export default function InstructorDashboardHome() {
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null); // { assignment, submission }

  const { setNotifications } = useNotificationStore();
  const { data: session } = useSession();
  const pathname = usePathname();
  const hasToasted = useRef(false);

  // Welcome toast — fires once per page session.
  useEffect(() => {
    if (session?.user && !hasToasted.current) {
      hasToasted.current = true;
      const fullName =
        session.user.name ||
        session.user.email?.split("@")[0] ||
        "instructor";
      toast.success(`Welcome back, ${shortName(fullName)}`, {
        description: `Logged in as ${session.user.email}`,
        duration: 3000,
      });
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;
    setError(null);
    Promise.all([
      getInstructorProfile(),
      getInstructorCourses(),
      getInstructorStudents(),
      getInstructorAssignments(),
      getNotifications(session.user.id),
    ])
      .then(([p, cs, ss, as, ns]) => {
        setProfile(p);
        setCourses(cs);
        setStudents(ss);
        setAssignments(as);
        setNotifications(ns);
      })
      .catch((err) => {
        console.warn("Instructor dashboard fetch failed:", err.message);
        setError("Failed to load dashboard. Please refresh.");
      });
  }, [setNotifications, pathname, session?.user?.id]);

  const pendingSubmissions = useMemo(() => {
    const rows = [];
    for (const a of assignments) {
      for (const s of a.submissions ?? []) {
        if (s.status === "submitted") {
          rows.push({ assignment: a, submission: s });
        }
      }
    }
    return rows.sort(
      (a, b) =>
        new Date(b.submission.submitted_at) -
        new Date(a.submission.submitted_at)
    );
  }, [assignments]);

  const avgScore = useMemo(() => {
    if (students.length === 0) return 0;
    return Math.round(
      students.reduce((acc, s) => acc + (s.quiz_average ?? 0), 0) /
        students.length
    );
  }, [students]);

  function handleReviewed({ assignmentId, submissionId, grade, feedback }) {
    setAssignments((list) =>
      list.map((a) =>
        a.id !== assignmentId
          ? a
          : {
              ...a,
              submissions: a.submissions.map((s) =>
                s.id === submissionId
                  ? { ...s, status: "reviewed", grade, feedback }
                  : s
              ),
            }
      )
    );
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
          {profile?.name
            ? `Hi, ${shortName(profile.name)}`
            : "Instructor Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Track your courses, students, and submissions at a glance.
        </p>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : (
        <>
          <StatsRow
            coursesCount={courses.length || profile?.courses_count || 0}
            studentsCount={students.length || profile?.students_count || 0}
            pendingCount={pendingSubmissions.length}
            avgScore={avgScore}
          />

          <CoursesSection courses={courses} />

          <RecentSubmissions
            rows={pendingSubmissions}
            onReview={(assignment, submission) =>
              setReviewing({ assignment, submission })
            }
          />

          <PerformanceChart students={students} />
        </>
      )}

      <AssignmentReviewModal
        isOpen={!!reviewing}
        assignment={reviewing?.assignment}
        submission={reviewing?.submission}
        onClose={() => setReviewing(null)}
        onReviewed={handleReviewed}
      />
    </motion.div>
  );
}

// ── Stats row ────────────────────────────────────────────────────────────

function StatsRow({ coursesCount, studentsCount, pendingCount, avgScore }) {
  const tiles = [
    { label: "Courses Managed", value: coursesCount, icon: BookOpen },
    { label: "Total Students", value: studentsCount, icon: Users },
    { label: "Assignments to Review", value: pendingCount, icon: ClipboardList },
    { label: "Avg Student Score", value: avgScore, suffix: "%", icon: BarChart2 },
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
        <span className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {count}
        </span>
        {suffix && (
          <span className="text-lg font-bold text-[var(--text-primary)]">
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] sm:text-sm">
        {label}
      </p>
    </motion.div>
  );
}

// ── Courses section ─────────────────────────────────────────────────────

function CoursesSection({ courses }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          My Courses
        </h2>
        <Link
          href="/instructor/courses"
          className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          Manage all →
        </Link>
      </div>
      {courses.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({ course, index }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      className="flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
            {course.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
            {course.description}
          </p>
        </div>
        {course.is_published && (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
            style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)" }}
          >
            Published
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-[var(--text-secondary)] font-mono-ui">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {course.students_count} students
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {course.modules_count} modules
        </span>
      </div>

      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${course.completion_rate}%` }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            className="h-full bg-[#10B981]"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)] font-mono-ui">
          {course.completion_rate}% avg completion
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Link
          href="/instructor/courses"
          className="flex-1 rounded-xl bg-[#10B981] px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          Manage →
        </Link>
        <Link
          href="/instructor/students"
          className="rounded-xl border border-[var(--border-color)] px-3 py-2 text-center text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          View Students
        </Link>
      </div>
    </motion.article>
  );
}

// ── Recent submissions ──────────────────────────────────────────────────

function RecentSubmissions({ rows, onReview }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Recent Submissions
      </h2>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            No pending reviews
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <tr>
                <Th>Student</Th>
                <Th>Assignment</Th>
                <Th>Course</Th>
                <Th>Submitted</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {rows.map(({ assignment, submission }) => (
                  <SubmissionRow
                    key={submission.id}
                    assignment={assignment}
                    submission={submission}
                    onReview={() => onReview(assignment, submission)}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
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

function SubmissionRow({ assignment, submission, onReview }) {
  const initial = submission.student_name?.charAt(0)?.toUpperCase() ?? "?";
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="border-b border-[var(--border-color)] last:border-b-0 transition-colors hover:bg-[var(--bg-secondary)]/50"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#10B981] text-xs font-bold text-white">
            {initial}
          </div>
          <span className="truncate text-[var(--text-primary)]">
            {submission.student_name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-[var(--text-primary)]">
        {assignment.title}
      </td>
      <td className="px-4 py-3 text-[var(--text-secondary)]">
        {assignment.course_title}
      </td>
      <td className="px-4 py-3 text-[var(--text-muted)] font-mono-ui">
        {formatDistanceToNow(new Date(submission.submitted_at), {
          addSuffix: true,
        })}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onReview}
          className="rounded-lg border border-[#10B981] px-3 py-1.5 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
        >
          Review
        </button>
      </td>
    </motion.tr>
  );
}

// ── Performance chart ───────────────────────────────────────────────────

function PerformanceChart({ students }) {
  const data = students.map((s) => ({
    name: s.name.split(" ")[0],
    score: s.quiz_average,
  }));
  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Student Quiz Averages
      </h2>
      {/* Explicit pixel height so Recharts can measure on the first render
          before flex/grid layouts settle. */}
      <div className="mt-4" style={{ width: "100%", height: 250 }}>
        {data.length === 0 ? (
          <div className="skeleton-shimmer h-full w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid
                stroke="var(--border-color)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(16,185,129,0.08)" }}
                content={<ScoreTooltip />}
              />
              <Bar
                dataKey="score"
                fill="#10B981"
                radius={[6, 6, 0, 0]}
                animationDuration={1200}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function ScoreTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p className="text-sm font-bold text-[#10B981] font-mono-ui">
        {payload[0].value}%
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
