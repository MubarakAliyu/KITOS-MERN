"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight,
  CheckCircle,
  FileText,
  Play,
} from "lucide-react";
import { getCourse, getCourseModules } from "@/_lib/api/courses";
import { getModuleLessons } from "@/_lib/api/lessons";
import QuizPlayer from "@/_components/quiz/QuizPlayer";

export default function CourseDetailPage({ params }) {
  const { courseId } = use(params);
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quizModuleId, setQuizModuleId] = useState(null);

  useEffect(() => {
    Promise.all([getCourse(courseId), getCourseModules(courseId)])
      .then(([c, m]) => {
        setCourse(c);
        setModules(m);
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return <CourseDetailSkeleton />;
  if (!course) return <p className="text-[var(--text-secondary)]">Course not found.</p>;

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--text-secondary)] font-mono-ui">
        <Link href="/student/courses" className="hover:text-[var(--text-primary)]">
          My Courses
        </Link>
        <span className="mx-2">›</span>
        <span className="text-[var(--text-primary)]">{course.title}</span>
      </nav>

      {/* Header card */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6"
      >
        <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {course.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          with {course.instructor_name}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">
          {course.description}
        </p>

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono-ui">
            <span>{course.progress}% overall progress</span>
            <span>
              {modules.length} modules · {modules.length * 2} lessons
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${course.progress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="h-full bg-[#10B981]"
            />
          </div>
        </div>
      </motion.section>

      {/* Module accordion */}
      <section className="flex flex-col gap-3">
        {modules.map((m, i) => (
          <ModuleRow
            key={m.id}
            module={m}
            index={i}
            onTakeQuiz={() => setQuizModuleId(m.quiz_id)}
          />
        ))}
      </section>

      <AnimatePresence>
        {quizModuleId && (
          <QuizPlayer
            quizId={quizModuleId}
            onClose={() => setQuizModuleId(null)}
            onComplete={() => setQuizModuleId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ModuleRow({ module: mod, index, onTakeQuiz }) {
  const [open, setOpen] = useState(index === 0);
  const [lessons, setLessons] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    getModuleLessons(mod.id).then((l) => {
      setLessons(l);
      setLoaded(true);
    });
  }, [open, loaded, mod.id]);

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)]"
      >
        <div className="flex items-center gap-3">
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[var(--text-secondary)]"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.span>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] sm:text-base">
              Module {mod.order_index}: {mod.title}
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono-ui">
              {loaded ? `${lessons.length} lessons` : "View lessons"}
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--border-color)]"
          >
            <ul className="flex flex-col">
              {(loaded ? lessons : []).map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
              {!loaded && (
                <li className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono-ui">
                  Loading…
                </li>
              )}
            </ul>
            {mod.quiz_id && (
              <div className="border-t border-[var(--border-color)] px-5 py-3">
                <button
                  type="button"
                  onClick={onTakeQuiz}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#10B981] px-3 py-1.5 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981] hover:text-white"
                >
                  Take Quiz
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LessonRow({ lesson }) {
  const Icon = lesson.content_type === "video" ? Play : FileText;
  const completed = lesson.completed; // dynamic completion state
  return (
    <li>
      <Link
        href={`/student/lessons/${lesson.id}`}
        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
          {lesson.title}
        </span>
        <span className="rounded bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          {lesson.content_type}
        </span>
        {completed && <CheckCircle className="h-4 w-4 text-[#10B981]" />}
      </Link>
    </li>
  );
}

function CourseDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="skeleton-shimmer h-4 w-40 rounded" />
      <div className="skeleton-shimmer h-40 w-full rounded-2xl" />
      <div className="skeleton-shimmer h-16 w-full rounded-2xl" />
      <div className="skeleton-shimmer h-16 w-full rounded-2xl" />
    </div>
  );
}
