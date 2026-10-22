"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, CheckCircle, Clock, Search } from "lucide-react";
import { getCourses } from "@/_lib/api/courses";
import { getPayments } from "@/_lib/api/payments";
import CourseThumbnail from "@/_components/ui/CourseThumbnail";

const COURSE_GRADIENTS = {
  c1: "from-[#10B981] to-[#059669]",
  c2: "from-[#3B82F6] to-[#1E40AF]",
  c3: "from-[#8B5CF6] to-[#5B21B6]",
};

function gradientFor(courseId) {
  return COURSE_GRADIENTS[courseId] ?? "from-[#10B981] to-[#059669]";
}

export default function CoursesPage() {
  const { data: session } = useSession();
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const studentId = session?.user?.id;
    Promise.all([
      getCourses(),
      studentId
        ? getPayments({ student_id: studentId }).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([list, payments]) => {
        setCourses(list ?? []);
        // Map course_id → best status. Prefer paid over pending over failed.
        const rank = { paid: 3, pending: 2, failed: 1 };
        const map = {};
        for (const p of payments ?? []) {
          const cur = map[p.course_id];
          if (!cur || (rank[p.status] ?? 0) > (rank[cur] ?? 0)) {
            map[p.course_id] = p.status;
          }
        }
        setEnrollments(map);
      })
      .finally(() => setLoading(false));
  }, [pathname, session?.user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, query]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Courses</h1>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
      </header>

      {loading ? (
        <CoursesGridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course, i) => (
            <CourseCard
              key={course.id}
              course={course}
              index={i}
              enrollmentStatus={enrollments[course.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, index, enrollmentStatus }) {
  const started = course.progress > 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm transition-shadow hover:shadow-lg"
    >
      <CourseThumbnail course={course} size="md" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
              {course.title}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {course.instructor_name}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
            {course.module_count} mod
          </span>
        </div>

        <div className="mt-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${course.progress}%` }}
              transition={{ duration: 0.6, delay: 0.1 + index * 0.05, ease: "easeOut" }}
              className="h-full bg-[#10B981]"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)] font-mono-ui">
            {course.progress}% complete
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <EnrollmentStatusBadge status={enrollmentStatus} />
          <Link
            href={`/student/courses/${course.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            {started ? "Continue" : "Start"}
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

function EnrollmentStatusBadge({ status }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
        <CheckCircle className="h-3 w-3" strokeWidth={2.5} />
        Enrolled
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono-ui">
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        Payment Pending
      </span>
    );
  }
  return <span />;
}

function CoursesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
        >
          <div className="skeleton-shimmer h-32 w-full" />
          <div className="flex flex-col gap-3 p-5">
            <div className="skeleton-shimmer h-4 w-2/3 rounded" />
            <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            <div className="skeleton-shimmer h-2 w-full rounded-full" />
            <div className="skeleton-shimmer mt-2 h-9 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <BookOpen className="h-7 w-7" />
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        No courses enrolled yet
      </p>
    </div>
  );
}
