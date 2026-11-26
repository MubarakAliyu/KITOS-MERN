"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, CheckCircle, Clock, Search } from "lucide-react";
import { getCourses } from "@/_lib/api/courses";
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
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  /**
   * Courses only. This used to fetch the child's payment rows alongside, to
   * badge each card "Enrolled" or "Payment Pending" — a leftover from when
   * the screen ran on mock data. Against the real API that is a `403` on
   * every visit, because `payment.view` belongs to administrators and
   * parents and not to children, and the `.catch(() => [])` meant it failed
   * silently: the badge simply never appeared and the console filled up.
   *
   * It should not have worked even if it had been permitted. Whether a fee
   * has been paid is between a parent and the school; "Payment Pending" is
   * not something to put in front of a nine-year-old. The course payload now
   * carries `enrollment_status`, which is the fact this screen actually
   * needs.
   */
  useEffect(() => {
    setLoading(true);
    getCourses()
      .then((list) => setCourses(list ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [pathname]);

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
              enrollmentStatus={course.enrollment_status}
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

/**
 * Enrolment, in the child's own terms.
 *
 * The three states a pupil can be in on a published course, and none of them
 * mentions money: on it, finished it, or not on it yet. The last reads "Not
 * enrolled" rather than "Payment Pending" — a child who sees a course they
 * are not on should be told to ask, not told their parent owes the school.
 */
function EnrollmentStatusBadge({ status }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
        <CheckCircle className="h-3 w-3" strokeWidth={2.5} />
        Completed
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
        <CheckCircle className="h-3 w-3" strokeWidth={2.5} />
        Enrolled
      </span>
    );
  }
  if (status === "") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        Not enrolled
      </span>
    );
  }
  // Null — the viewer is not a student, so the question does not apply.
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
