"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  getAdminCourses,
  getAdminUsers,
  publishCourse,
  unpublishCourse,
} from "@/_lib/api/admin";
import CreateCourseModal from "@/_components/admin/CreateCourseModal";
import EditCourseModal from "@/_components/admin/EditCourseModal";
import DeleteCourseConfirmModal from "@/_components/admin/DeleteCourseConfirmModal";
import CourseThumbnail from "@/_components/ui/CourseThumbnail";
import Link from "next/link";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const COURSE_GRADIENT = {
  c1: "from-[#10B981] to-[#059669]",
  c2: "from-[#3B82F6] to-[#1E40AF]",
  c3: "from-[#8B5CF6] to-[#5B21B6]",
};

function gradientFor(id) {
  return COURSE_GRADIENT[id] ?? "from-[#10B981] to-[#059669]";
}

function formatNaira(n) {
  return `₦${Number(n).toLocaleString("en-NG")}`;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { notify } = useLiveNotify();

  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getAdminCourses(), getAdminUsers()])
      .then(([c, u]) => {
        setCourses(c?.courses ?? c ?? []);
        setTotalRevenue(c?.total_revenue ?? 0);
        setUsers(u);
      })
      .catch((err) => {
        console.warn("Courses fetch failed:", err.message);
        setError("Failed to load courses. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  const instructors = useMemo(
    () => users.filter((u) => u.role === "instructor"),
    [users]
  );

  const stats = useMemo(() => {
    return {
      total: courses.length,
      published: courses.filter((c) => c.is_published).length,
      revenue: totalRevenue || courses.reduce((s, c) => s + (c.revenue ?? 0), 0),
    };
  }, [courses, totalRevenue]);

  async function togglePublish(course) {
    const next = !course.is_published;
    setCourses((list) =>
      list.map((c) => (c.id === course.id ? { ...c, is_published: next } : c))
    );
    try {
      if (next) {
        await publishCourse(course.id);
        notify("course_published", { title: course.title });
      } else {
        await unpublishCourse(course.id);
        notify("course_unpublished", { title: course.title });
      }
    } catch {
      // Roll back optimistic flip on failure
      setCourses((list) =>
        list.map((c) =>
          c.id === course.id ? { ...c, is_published: !next } : c
        )
      );
      toast.error("Couldn't update course");
    }
  }

  function handleDeleted(id) {
    setCourses((list) => list.filter((c) => c.id !== id));
  }

  function handleUpdated(updated) {
    setCourses((list) =>
      list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
  }

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
            Course Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Author, publish, and retire courses across the platform.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Course
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat label="Total Courses" value={stats.total.toString()} tone="neutral" />
        <MiniStat
          label="Published"
          value={stats.published.toString()}
          tone="green"
        />
        <MiniStat
          label="Total Revenue"
          value={formatNaira(stats.revenue)}
          tone="teal"
        />
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-72 rounded-2xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
          No courses yet. Add your first course to get started.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {courses.map((c, i) => (
            <CourseCard
              key={c.id}
              course={c}
              index={i}
              onTogglePublish={() => togglePublish(c)}
              onEdit={() => setEditing(c)}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </div>
      )}

      <CreateCourseModal
        isOpen={openCreate}
        onClose={() => setOpenCreate(false)}
        instructors={instructors}
        onCreated={(c) => setCourses((prev) => [c, ...prev])}
      />
      <EditCourseModal
        isOpen={!!editing}
        course={editing}
        instructors={instructors}
        onClose={() => setEditing(null)}
        onUpdated={handleUpdated}
      />
      <DeleteCourseConfirmModal
        course={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={handleDeleted}
      />
    </motion.div>
  );
}

function MiniStat({ label, value, tone }) {
  const toneColor =
    tone === "teal" ? "#10B981" : tone === "green" ? "#22C55E" : "var(--text-primary)";
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-bold font-mono-ui"
        style={{ color: toneColor }}
      >
        {value}
      </p>
    </div>
  );
}

function CourseCard({ course, index, onTogglePublish, onEdit, onDelete }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm transition-shadow hover:shadow-lg"
    >
      <div className="relative">
        <CourseThumbnail course={course} size="md" />
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
          style={
            course.is_published
              ? { color: "#10B981", backgroundColor: "rgba(16,185,129,0.15)" }
              : { color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.15)" }
          }
        >
          {course.is_published ? "Published" : "Draft"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-[var(--text-primary)]">
            {course.title}
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {course.instructor_name}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
            {course.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] font-mono-ui">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {course.students_count} students
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            {course.modules_count} modules
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            {formatNaira(course.revenue ?? 0)}
          </span>
        </div>

        <span
          className="w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
          style={
            course.payment_type === "subscription"
              ? { color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)" }
              : { color: "#3B82F6", backgroundColor: "rgba(59,130,246,0.12)" }
          }
        >
          {course.payment_type === "subscription" ? "Subscription" : "One-time"}
        </span>

        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${course.completion_rate ?? 0}%` }}
              transition={{ duration: 0.7, delay: 0.1 + index * 0.05, ease: "easeOut" }}
              className="h-full bg-[#10B981]"
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)] font-mono-ui">
            {course.completion_rate ?? 0}% avg completion
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--border-color)] p-4">
        {course.is_published ? (
          <button
            type="button"
            onClick={onTogglePublish}
            className="w-full rounded-xl border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-500 transition-colors hover:bg-amber-500/10"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={onTogglePublish}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            Publish
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        )}
        <Link
          href={`/admin/courses/${course.id}/editor`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#10B981] px-3 py-2 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Manage Content
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </motion.article>
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
