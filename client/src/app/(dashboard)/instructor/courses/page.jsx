"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  Film,
  Layers,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getInstructorAssignments,
  getInstructorCourses,
  deleteQuiz,
} from "@/_lib/api/instructor";
import { getCourseModules, deleteModule } from "@/_lib/api/courses";
import { apiClient } from "@/_lib/api/client";
import CourseThumbnail from "@/_components/ui/CourseThumbnail";
import AddModuleModal from "@/_components/instructor/AddModuleModal";
import AddLessonModal from "@/_components/instructor/AddLessonModal";
import AddQuizModal from "@/_components/instructor/AddQuizModal";
import EditQuizModal from "@/_components/instructor/EditQuizModal";
import AddAssignmentModal from "@/_components/instructor/AddAssignmentModal";
import EditAssignmentModal from "@/_components/instructor/EditAssignmentModal";
import EditLessonModal from "@/_components/editor/EditLessonModal";
import LessonPreviewModal from "@/_components/editor/LessonPreviewModal";
import DeleteLessonModal from "@/_components/editor/DeleteLessonModal";
import ViewQuizModal from "@/_components/instructor/ViewQuizModal";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const CONTENT_ICON = {
  video: Film,
  text: FileText,
  file: Paperclip,
  link: LinkIcon,
};

export default function InstructorCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addModule, setAddModule] = useState(null); // courseId
  const [editingAssignment, setEditingAssignment] = useState(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getInstructorCourses(),
      getInstructorAssignments().catch(() => []),
    ])
      .then(([courseList, assignmentList]) => {
        setCourses(courseList ?? []);
        setAssignments(assignmentList ?? []);
      })
      .catch((err) => {
        console.warn("Courses fetch failed:", err.message);
        setError("Failed to load courses. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  function handleAssignmentUpdated(updated) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    );
    toast.success("Assignment updated");
  }

  function handleReviewSubmissions(assignment) {
    router.push(`/instructor/assignments?id=${assignment.id}`);
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
          My Courses
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Author modules, lessons, quizzes, and assignments for each course.
        </p>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-48 rounded-2xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
          You haven&apos;t created any courses yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {courses.map((course) => (
            <CourseSection
              key={course.id}
              course={course}
              assignments={assignments}
              onAddModule={() => setAddModule(course.id)}
              onEditAssignment={setEditingAssignment}
              onReviewSubmissions={handleReviewSubmissions}
            />
          ))}
        </div>
      )}

      <AddModuleModal
        isOpen={!!addModule}
        onClose={() => setAddModule(null)}
        courseId={addModule}
        onCreated={() => toast.info("Refresh to see the new module")}
      />

      <EditAssignmentModal
        isOpen={!!editingAssignment}
        assignment={editingAssignment}
        onClose={() => setEditingAssignment(null)}
        onSuccess={handleAssignmentUpdated}
      />
    </motion.div>
  );
}

// ── Course section with module accordion ─────────────────────────────────

function CourseSection({
  course,
  assignments,
  onAddModule,
  onEditAssignment,
  onReviewSubmissions,
}) {
  const [modules, setModules] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCourseModules(course.id)
      .then((m) => {
        setModules(m);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [course.id]);

  async function handleDeleteModule(mod) {
    if (!window.confirm(`Are you sure you want to delete the module "${mod.title}"? This will delete all its lessons, quizzes, and assignments.`)) {
      return;
    }
    try {
      await deleteModule(mod.id);
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
      toast.success("Module deleted successfully");
    } catch (err) {
      console.warn("Delete module failed:", err.message);
      toast.error("Failed to delete module");
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <header className="flex flex-col gap-3 border-b border-[var(--border-color)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="shrink-0 overflow-hidden rounded-xl">
            <CourseThumbnail course={course} size="sm" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {course.title}
              </h2>
            {course.is_published && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                style={{
                  color: "#10B981",
                  backgroundColor: "rgba(16,185,129,0.12)",
                }}
              >
                Published
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {course.description}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-ui">
            <Users className="h-3.5 w-3.5" />
            {course.students_count} enrolled
          </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddModule}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Module
        </button>
      </header>

      <div className="flex flex-col">
        {!loaded ? (
          <div className="p-5">
            <div className="skeleton-shimmer h-12 w-full rounded-xl" />
          </div>
        ) : modules.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">
            No modules yet. Add one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {modules.map((m, i) => (
              <ModuleRow
                key={m.id}
                module={m}
                courseTitle={course.title}
                index={i}
                assignment={assignments.find((a) => a.module_id === m.id)}
                onEditAssignment={onEditAssignment}
                onReviewSubmissions={onReviewSubmissions}
                onDeleteModule={handleDeleteModule}
                onUpdateModule={(updated) => {
                  setModules((prev) =>
                    prev.map((x) => (x.id === updated.id ? updated : x))
                  );
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

// ── Module accordion row ────────────────────────────────────────────────

function ModuleRow({
  module,
  courseTitle,
  index,
  assignment,
  onEditAssignment,
  onReviewSubmissions,
  onDeleteModule,
  onUpdateModule,
}) {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="grid h-6 w-6 shrink-0 place-items-center text-[var(--text-secondary)]"
        >
          <ChevronDown className="h-4 w-4 -rotate-90" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--text-primary)]">
            {index + 1}. {module.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Pill icon={Layers}>{module.lessons_count} lessons</Pill>
            {module.quiz_id && <Pill tone="teal">Quiz</Pill>}
            {module.assignment_id && <Pill tone="amber">Assignment</Pill>}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteModule?.(module);
            }}
            aria-label="Delete module"
            className="grid h-8 w-8 place-items-center rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ModuleBody
              module={module}
              courseTitle={courseTitle}
              assignment={assignment}
              onEditAssignment={onEditAssignment}
              onReviewSubmissions={onReviewSubmissions}
              onUpdateModule={onUpdateModule}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Pill({ children, tone, icon: Icon }) {
  const styles =
    tone === "teal"
      ? { color: "#10B981", bg: "rgba(16,185,129,0.12)" }
      : tone === "amber"
      ? { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" }
      : { color: "var(--text-secondary)", bg: "var(--bg-secondary)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: styles.color, backgroundColor: styles.bg }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

// ── Module body (lessons + quiz + assignment) ───────────────────────────

function ModuleBody({
  module,
  courseTitle,
  assignment,
  onEditAssignment,
  onReviewSubmissions,
  onUpdateModule,
}) {
  const [lessons, setLessons] = useState([]);
  const [loadedLessons, setLoadedLessons] = useState(false);
  const [addLesson, setAddLesson] = useState(false);
  const [addQuiz, setAddQuiz] = useState(false);
  const [addAssignment, setAddAssignment] = useState(false);
  const [hasQuiz, setHasQuiz] = useState(!!module.quiz_id);
  const [viewQuiz, setViewQuiz] = useState(null); // { id, title }
  const [editQuiz, setEditQuiz] = useState(null); // { id, title }
  const [hasAssignment, setHasAssignment] = useState(!!module.assignment_id);

  const assignmentSummary = useMemo(() => {
    const subs = assignment?.submissions ?? [];
    return {
      total: subs.length,
      reviewed: subs.filter((s) => s.status === "reviewed").length,
      submitted: subs.filter((s) => s.status === "submitted").length,
    };
  }, [assignment]);

  const [editingLesson, setEditingLesson] = useState(null);
  const [previewingLesson, setPreviewingLesson] = useState(null);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const { notify } = useLiveNotify();

  useEffect(() => {
    setLoadedLessons(false);
    apiClient
      .get(`/modules/${module.id}/lessons`)
      .then((res) => {
        setLessons(res.data);
        setLoadedLessons(true);
      })
      .catch(() => setLoadedLessons(true));
  }, [module.id]);

  function handleLessonCreated(lesson) {
    setLessons((list) => [...list, lesson]);
  }

  function handleLessonSaved(updated) {
    setLessons((list) =>
      list.map((l) => (l.id === updated.id ? { ...l, ...updated } : l))
    );
    notify("lesson_saved", { title: updated.title });
  }

  function handleLessonDeleted(lesson) {
    setLessons((list) => list.filter((l) => l.id !== lesson.id));
    notify("lesson_deleted", { title: lesson.title });
  }

  async function handleDeleteQuiz(quizId) {
    if (!window.confirm("Are you sure you want to delete this quiz? This will delete all its questions and student submissions.")) {
      return;
    }
    try {
      await deleteQuiz(quizId);
      setHasQuiz(false);
      onUpdateModule?.({ ...module, quiz_id: null });
      toast.success("Quiz deleted successfully");
    } catch (err) {
      console.warn("Delete quiz failed:", err.message);
      toast.error("Failed to delete quiz");
    }
  }

  return (
    <div className="grid gap-5 bg-[var(--bg-secondary)] px-5 py-5 lg:grid-cols-3">
      {/* Lessons */}
      <section className="lg:col-span-2">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Lessons
        </h4>
        {!loadedLessons ? (
          <div className="skeleton-shimmer h-12 w-full rounded-lg" />
        ) : lessons.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No lessons yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lessons.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                onEdit={() => setEditingLesson(l)}
                onPreview={() => setPreviewingLesson(l)}
                onDelete={() => setDeletingLesson(l)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setAddLesson(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-2 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add Lesson
        </button>
      </section>

      {/* Quiz + Assignment */}
      <section className="flex flex-col gap-4">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
            Quiz
          </h4>
          {hasQuiz ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-3">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#10B981] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
                <Sparkles className="h-3 w-3" />
                Quiz attached
              </span>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setViewQuiz({ id: module.quiz_id, title: module.title + " Quiz" })}
                  className="text-xs font-semibold text-[#10B981] hover:underline font-mono-ui"
                >
                  View Quiz
                </button>
                <span className="text-[var(--border-color)]">|</span>
                <button
                  type="button"
                  onClick={() => setEditQuiz({ id: module.quiz_id, title: module.title + " Quiz" })}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[#10B981] hover:underline font-mono-ui"
                >
                  Edit
                </button>
                <span className="text-[var(--border-color)]">|</span>
                <button
                  type="button"
                  onClick={() => handleDeleteQuiz(module.quiz_id)}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline font-mono-ui"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddQuiz(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-2 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add Quiz
            </button>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
            Assignment
          </h4>
          {hasAssignment ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <p className="inline-flex items-start gap-2 text-xs font-bold text-[var(--text-primary)]">
                <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F59E0B]" />
                <span className="min-w-0 break-words">
                  {assignment?.title ?? `Assigned in ${courseTitle}`}
                </span>
              </p>
              {assignment?.deadline && (
                <p className="text-[11px] text-[var(--text-secondary)] font-mono-ui">
                  Due {assignment.deadline}
                </p>
              )}
              <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                {assignmentSummary.total} submitted ·{" "}
                {assignmentSummary.reviewed} reviewed
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!assignment}
                  onClick={() => assignment && onEditAssignment?.(assignment)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={!assignment}
                  onClick={() => assignment && onReviewSubmissions?.(assignment)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#10B981] px-2.5 py-1 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Eye className="h-3 w-3" />
                  Review Submissions
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddAssignment(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-2 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Add Assignment
            </button>
          )}
        </div>
      </section>

      <AddLessonModal
        isOpen={addLesson}
        moduleId={module.id}
        onClose={() => setAddLesson(false)}
        onCreated={handleLessonCreated}
      />
      <AddQuizModal
        isOpen={addQuiz}
        moduleId={module.id}
        onClose={() => setAddQuiz(false)}
        onCreated={(created) => {
          setHasQuiz(true);
          onUpdateModule?.({ ...module, quiz_id: created?.id });
          notify("quiz_created", { module: module.title });
        }}
      />
      <AddAssignmentModal
        isOpen={addAssignment}
        moduleId={module.id}
        onClose={() => setAddAssignment(false)}
        onCreated={(created) => {
          setHasAssignment(true);
          notify("assignment_created", {
            title: created?.title ?? "New assignment",
          });
        }}
      />

      <EditLessonModal
        lesson={editingLesson}
        onClose={() => setEditingLesson(null)}
        onSaved={handleLessonSaved}
      />
      <LessonPreviewModal
        lesson={previewingLesson}
        onClose={() => setPreviewingLesson(null)}
      />
      <DeleteLessonModal
        lesson={deletingLesson}
        onClose={() => setDeletingLesson(null)}
        onDeleted={handleLessonDeleted}
      />
      <ViewQuizModal
        isOpen={!!viewQuiz}
        quizId={viewQuiz?.id}
        quizTitle={viewQuiz?.title}
        onClose={() => setViewQuiz(null)}
      />
      <EditQuizModal
        isOpen={!!editQuiz}
        quizId={editQuiz?.id}
        onClose={() => setEditQuiz(null)}
        onUpdated={(updated) => {
          onUpdateModule?.({ ...module, quiz_id: updated?.id });
          notify("quiz_saved", { module: module.title });
        }}
      />
    </div>
  );
}

function LessonRow({ lesson, onEdit, onPreview, onDelete }) {
  const Icon = CONTENT_ICON[lesson.content_type] ?? FileText;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#10B981]/10 text-[#10B981]">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
      <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
        {lesson.title}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onPreview}
        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
      >
        Preview
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
      >
        Delete
      </button>
    </li>
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
