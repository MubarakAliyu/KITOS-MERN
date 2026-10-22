"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  getCourseEditor,
  publishCourse,
  unpublishCourse,
  updateCourse,
} from "@/_lib/api/admin";
import CourseThumbnail from "@/_components/ui/CourseThumbnail";
import AddModuleModal from "@/_components/instructor/AddModuleModal";
import AddLessonModal from "@/_components/instructor/AddLessonModal";
import AddQuizModal from "@/_components/instructor/AddQuizModal";
import EditQuizModal from "@/_components/instructor/EditQuizModal";
import ViewQuizModal from "@/_components/instructor/ViewQuizModal";
import AddAssignmentModal from "@/_components/instructor/AddAssignmentModal";
import EditAssignmentModal from "@/_components/instructor/EditAssignmentModal";
import AssignmentReviewModal from "@/_components/instructor/AssignmentReviewModal";
import EditLessonModal from "@/_components/editor/EditLessonModal";
import LessonPreviewModal from "@/_components/editor/LessonPreviewModal";
import DeleteLessonModal from "@/_components/editor/DeleteLessonModal";
import { deleteQuiz } from "@/_lib/api/instructor";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const SUBMISSION_TONE = {
  submitted: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  reviewed: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
};

export default function AdminCourseEditorPage() {
  const params = useParams();
  const courseId = params.courseId;
  const pathname = usePathname();

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [lessonsByModule, setLessonsByModule] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [openAddModule, setOpenAddModule] = useState(false);
  const [openAddLesson, setOpenAddLesson] = useState(null);
  const [openAddQuiz, setOpenAddQuiz] = useState(null);
  const [openEditQuiz, setOpenEditQuiz] = useState(null);
  const [viewQuiz, setViewQuiz] = useState(null);
  const [openAddAssignment, setOpenAddAssignment] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const [editingLesson, setEditingLesson] = useState(null);
  const [previewingLesson, setPreviewingLesson] = useState(null);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const { notify } = useLiveNotify();

  // Inline editing state for course title/description.
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [thumbnailPreview, setThumbnailPreview] = useState(null);
  const [savingHeader, setSavingHeader] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCourseEditor(courseId)
      .then((data) => {
        setCourse(data.course);
        setModules(data.modules ?? []);
        setLessonsByModule(data.lessons_by_module ?? {});
        setAssignments(data.assignments ?? []);
        setTitleDraft(data.course?.title ?? "");
        setDescDraft(data.course?.description ?? "");
        setThumbnailPreview(data.course?.thumbnail_url ?? null);
      })
      .catch((err) => {
        console.warn("Editor fetch failed:", err.message);
        setError("Failed to load course editor. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [courseId, pathname]);

  function handleThumbnailFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setThumbnailPreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveHeader() {
    if (!course) return;
    setSavingHeader(true);
    try {
      await updateCourse(course.id, {
        title: titleDraft,
        description: descDraft,
        thumbnail_url: thumbnailPreview,
      });
      setCourse((c) =>
        c
          ? {
              ...c,
              title: titleDraft,
              description: descDraft,
              thumbnail_url: thumbnailPreview,
            }
          : c
      );
      toast.success("Course header saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSavingHeader(false);
    }
  }

  async function togglePublish() {
    if (!course) return;
    const next = !course.is_published;
    setCourse((c) => ({ ...c, is_published: next }));
    try {
      if (next) {
        await publishCourse(course.id);
        toast.success("Course published");
      } else {
        await unpublishCourse(course.id);
        toast.success("Course unpublished");
      }
    } catch {
      setCourse((c) => ({ ...c, is_published: !next }));
      toast.error("Couldn't update status");
    }
  }

  function moveModule(idx, dir) {
    setModules((list) => {
      const target = idx + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((m, i) => ({ ...m, order_index: i + 1 }));
    });
  }

  function deleteModule(moduleId) {
    if (!confirm("Delete this module? This cannot be undone.")) return;
    setModules((list) => list.filter((m) => m.id !== moduleId));
    toast.success("Module deleted");
  }

  async function handleDeleteQuiz(quizId, moduleId) {
    if (!confirm("Are you sure you want to delete this quiz? This will delete all its questions and student submissions.")) return;
    try {
      await deleteQuiz(quizId);
      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, quiz_id: null } : m))
      );
      toast.success("Quiz deleted successfully");
    } catch {
      toast.error("Couldn't delete quiz");
    }
  }

  function handleLessonCreated(moduleId, lesson) {
    setLessonsByModule((map) => ({
      ...map,
      [moduleId]: [...(map[moduleId] ?? []), lesson],
    }));
  }

  function handleLessonSaved(updated) {
    setLessonsByModule((map) => {
      const next = {};
      for (const [moduleId, list] of Object.entries(map)) {
        next[moduleId] = list.map((l) =>
          l.id === updated.id ? { ...l, ...updated } : l
        );
      }
      return next;
    });
    notify("lesson_saved", { title: updated.title });
  }

  function handleLessonDeleted(lesson) {
    setLessonsByModule((map) => {
      const next = {};
      for (const [moduleId, list] of Object.entries(map)) {
        next[moduleId] = list.filter((l) => l.id !== lesson.id);
      }
      return next;
    });
    notify("lesson_deleted", { title: lesson.title });
  }

  function handleAssignmentUpdated(updated) {
    setAssignments((list) =>
      list.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    );
    notify("assignment_updated", { title: updated.title });
  }

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

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton-shimmer h-8 w-1/3 rounded" />
        <div className="skeleton-shimmer h-40 w-full rounded-2xl" />
        <div className="skeleton-shimmer h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
        <p className="text-sm text-red-400">{error ?? "Course not found"}</p>
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <Breadcrumb courseTitle={course.title} />

      <CourseHeader
        course={{ ...course, thumbnail_url: thumbnailPreview }}
        titleDraft={titleDraft}
        descDraft={descDraft}
        setTitleDraft={setTitleDraft}
        setDescDraft={setDescDraft}
        onThumbnailFile={handleThumbnailFile}
        onClearThumbnail={() => setThumbnailPreview(null)}
        onSave={handleSaveHeader}
        saving={savingHeader}
        onTogglePublish={togglePublish}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Modules
          </h2>
          <button
            type="button"
            onClick={() => setOpenAddModule(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add Module
          </button>
        </div>

        {modules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-secondary)]">
            No modules yet. Add the first module to start authoring lessons.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {modules.map((m, i) => (
              <ModuleRow
                key={m.id}
                module={m}
                index={i}
                isFirst={i === 0}
                isLast={i === modules.length - 1}
                lessons={lessonsByModule[m.id] ?? []}
                assignment={assignments.find((a) => a.module_id === m.id)}
                onMoveUp={() => moveModule(i, -1)}
                onMoveDown={() => moveModule(i, 1)}
                onDelete={() => deleteModule(m.id)}
                onAddLesson={() => setOpenAddLesson(m.id)}
                onAddQuiz={() => setOpenAddQuiz(m.id)}
                onAddAssignment={() => setOpenAddAssignment(m.id)}
                onEditAssignment={setEditingAssignment}
                onReview={(assignment, submission) =>
                  setReviewing({ assignment, submission })
                }
                onEditLesson={setEditingLesson}
                onPreviewLesson={setPreviewingLesson}
                onDeleteLesson={setDeletingLesson}
                onViewQuiz={(quiz) => setViewQuiz(quiz)}
                onEditQuiz={(quiz) => setOpenEditQuiz(quiz)}
                onDeleteQuiz={(quizId) => handleDeleteQuiz(quizId, m.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <AddModuleModal
        isOpen={openAddModule}
        onClose={() => setOpenAddModule(false)}
        courseId={course.id}
        onCreated={(m) =>
          setModules((prev) => [
            ...prev,
            { ...m, lessons_count: 0, quiz_id: null, assignment_id: null },
          ])
        }
      />
      <AddLessonModal
        isOpen={!!openAddLesson}
        moduleId={openAddLesson}
        onClose={() => setOpenAddLesson(null)}
        onCreated={(lesson) => handleLessonCreated(openAddLesson, lesson)}
      />
      <AddQuizModal
        isOpen={!!openAddQuiz}
        moduleId={openAddQuiz}
        onClose={() => setOpenAddQuiz(null)}
        onCreated={(created) => {
          const moduleTitle =
            modules.find((m) => m.id === openAddQuiz)?.title ?? "module";
          setModules((prev) =>
            prev.map((m) =>
              m.id === openAddQuiz ? { ...m, quiz_id: created?.id ?? `q-${Date.now()}` } : m
            )
          );
          notify("quiz_created", { module: moduleTitle });
        }}
      />
      <ViewQuizModal
        isOpen={!!viewQuiz}
        quizId={viewQuiz?.id}
        quizTitle={viewQuiz?.title}
        onClose={() => setViewQuiz(null)}
      />
      <EditQuizModal
        isOpen={!!openEditQuiz}
        quizId={openEditQuiz?.id}
        onClose={() => setOpenEditQuiz(null)}
        onUpdated={(updated) => {
          setModules((prev) =>
            prev.map((m) =>
              m.quiz_id === updated.id || m.id === updated.module_id
                ? { ...m, quiz_id: updated.id }
                : m
            )
          );
          const moduleTitle =
            modules.find((m) => m.quiz_id === updated.id || m.id === updated.module_id)?.title ?? "module";
          notify("quiz_saved", { module: moduleTitle });
        }}
      />
      <AddAssignmentModal
        isOpen={!!openAddAssignment}
        moduleId={openAddAssignment}
        courseId={course.id}
        courseTitle={course.title}
        onClose={() => setOpenAddAssignment(null)}
        onCreated={(created) => {
          setModules((prev) =>
            prev.map((m) =>
              m.id === openAddAssignment
                ? { ...m, assignment_id: created?.id ?? `a-${Date.now()}` }
                : m
            )
          );
          if (created) {
            setAssignments((prev) => [
              { ...created, submissions: created.submissions ?? [] },
              ...prev,
            ]);
          }
          notify("assignment_created", {
            title: created?.title ?? "New assignment",
          });
        }}
      />
      <EditAssignmentModal
        isOpen={!!editingAssignment}
        assignment={editingAssignment}
        onClose={() => setEditingAssignment(null)}
        onSuccess={handleAssignmentUpdated}
      />
      <AssignmentReviewModal
        isOpen={!!reviewing}
        assignment={reviewing?.assignment}
        submission={reviewing?.submission}
        onClose={() => setReviewing(null)}
        onReviewed={handleReviewed}
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
    </motion.div>
  );
}

function Breadcrumb({ courseTitle }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-mono-ui">
      <Link
        href="/admin/courses"
        className="transition-colors hover:text-[var(--text-primary)]"
      >
        Courses
      </Link>
      <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
      <span className="truncate text-[var(--text-primary)]">{courseTitle}</span>
      <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
      <span className="text-[#10B981]">Content Editor</span>
    </nav>
  );
}

function CourseHeader({
  course,
  titleDraft,
  descDraft,
  setTitleDraft,
  setDescDraft,
  onThumbnailFile,
  onClearThumbnail,
  onSave,
  saving,
  onTogglePublish,
}) {
  return (
    <article className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:flex-row sm:gap-6 sm:p-6">
      <div className="w-full max-w-xs shrink-0">
        <div className="overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
          <CourseThumbnail course={course} size="md" />
        </div>
        <label className="group mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] p-2 transition-colors hover:border-[#10B981]">
          <Upload className="h-3.5 w-3.5 text-[var(--text-secondary)] group-hover:text-[#10B981]" />
          <span className="text-xs text-[var(--text-secondary)] group-hover:text-[#10B981]">
            Upload thumbnail
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={onThumbnailFile}
            className="hidden"
          />
        </label>
        {course.thumbnail_url && (
          <button
            type="button"
            onClick={onClearThumbnail}
            className="mt-1 text-xs font-semibold text-red-400 transition-colors hover:text-red-500"
          >
            Remove (use initial)
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-2xl font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] focus:border-[#10B981] focus:bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
            style={
              course.is_published
                ? { color: "#10B981", backgroundColor: "rgba(16,185,129,0.15)" }
                : { color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.15)" }
            }
          >
            {course.is_published ? "Published" : "Draft"}
          </span>
        </div>

        <textarea
          rows={2}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] focus:border-[#10B981] focus:bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />

        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] font-mono-ui">
          <span>Instructor: {course.instructor_name ?? "—"}</span>
          <span>·</span>
          <span>{course.students_count ?? 0} enrolled</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-[#10B981] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Header
          </button>
          <button
            type="button"
            onClick={onTogglePublish}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              course.is_published
                ? "border border-amber-500 text-amber-500 hover:bg-amber-500/10"
                : "bg-[#10B981] text-white hover:bg-[#059669]"
            }`}
          >
            {course.is_published ? (
              "Unpublish"
            ) : (
              <span className="inline-flex items-center gap-1.5">
                Publish
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function ModuleRow({
  module,
  index,
  isFirst,
  isLast,
  lessons,
  assignment,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddLesson,
  onAddQuiz,
  onAddAssignment,
  onEditAssignment,
  onReview,
  onEditLesson,
  onPreviewLesson,
  onDeleteLesson,
  onViewQuiz,
  onEditQuiz,
  onDeleteQuiz,
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <header className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          aria-label="Toggle module"
        >
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </motion.span>
        </button>
        <p className="flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
          {index + 1}. {module.title}
        </p>
        <span className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
          {lessons.length} lessons
        </span>
        {module.quiz_id && (
          <span className="shrink-0 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
            Quiz
          </span>
        )}
        {module.assignment_id && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono-ui">
            Assignment
          </span>
        )}
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-40"
          title="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-40"
          title="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid h-7 w-7 place-items-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
          title="Delete module"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-[var(--border-color)] bg-[var(--bg-secondary)]"
          >
            <div className="grid gap-5 p-5 lg:grid-cols-3">
              <section className="lg:col-span-2">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  Lessons
                </h4>
                {lessons.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No lessons yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lessons.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                      >
                        <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                          {l.content_type}
                        </span>
                        <span className="flex-1 truncate text-[var(--text-primary)]">
                          {l.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => onEditLesson?.(l)}
                          title="Edit lesson"
                          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onPreviewLesson?.(l)}
                          title="Preview as student"
                          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteLesson?.(l)}
                          title="Delete lesson"
                          className="grid h-7 w-7 place-items-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={onAddLesson}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-1.5 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Lesson
                </button>
              </section>

              <section className="flex flex-col gap-4">
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                    Quiz
                  </h4>
                  {module.quiz_id ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-3">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#10B981] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
                        <Sparkles className="h-3 w-3" />
                        Quiz attached
                      </span>
                      <div className="flex items-center gap-3 mt-1">
                        <button
                          type="button"
                          onClick={() => onViewQuiz?.({ id: module.quiz_id, title: module.title + " Quiz" })}
                          className="text-xs font-semibold text-[#10B981] hover:underline font-mono-ui"
                        >
                          View
                        </button>
                        <span className="text-[var(--border-color)]">|</span>
                        <button
                          type="button"
                          onClick={() => onEditQuiz?.({ id: module.quiz_id, title: module.title + " Quiz" })}
                          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[#10B981] hover:underline font-mono-ui"
                        >
                          Edit
                        </button>
                        <span className="text-[var(--border-color)]">|</span>
                        <button
                          type="button"
                          onClick={() => onDeleteQuiz?.(module.quiz_id)}
                          className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline font-mono-ui"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onAddQuiz}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-1.5 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Quiz
                    </button>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                    Assignment
                  </h4>
                  {assignment ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="inline-flex min-w-0 items-start gap-2 text-xs font-bold text-[var(--text-primary)]">
                          <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="break-words">{assignment.title}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => onEditAssignment?.(assignment)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                          title="Edit assignment"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                      {assignment.deadline && (
                        <p className="text-[11px] text-[var(--text-secondary)] font-mono-ui">
                          Due {assignment.deadline}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onAddAssignment}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-1.5 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Assignment
                    </button>
                  )}
                </div>
              </section>

              {assignment && (
                <section className="lg:col-span-3">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                    All Submissions — {assignment.title}
                  </h4>
                  {assignment.submissions?.length ? (
                    <SubmissionsTable
                      assignment={assignment}
                      onReview={onReview}
                    />
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">
                      No submissions yet.
                    </p>
                  )}
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function SubmissionsTable({ assignment, onReview }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Student
            </th>
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Submitted
            </th>
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Type
            </th>
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Status
            </th>
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Grade
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider font-mono-ui">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {assignment.submissions.map((s) => {
            const tone = SUBMISSION_TONE[s.status] ?? SUBMISSION_TONE.submitted;
            return (
              <tr
                key={s.id}
                className="border-b border-[var(--border-color)] last:border-b-0"
              >
                <td className="px-4 py-2 text-[var(--text-primary)]">
                  {s.student_name}
                </td>
                <td className="px-4 py-2 text-[var(--text-muted)] font-mono-ui">
                  {formatDistanceToNow(new Date(s.submitted_at), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
                    {s.submission_type}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                    style={{ color: tone.color, backgroundColor: tone.bg }}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono-ui text-[var(--text-primary)]">
                  {s.grade ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onReview(assignment, s)}
                    className="rounded-lg border border-[#10B981] px-3 py-1 text-[11px] font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
                  >
                    {s.status === "reviewed" ? "Re-review" : "Review"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
