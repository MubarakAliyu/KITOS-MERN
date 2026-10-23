"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  Clock,
  MessageSquare,
  X,
} from "lucide-react";

function buildCourseRows(student) {
  return student.enrolled_courses_details ?? [];
}

function quizScoreColor(score) {
  if (score >= 90) return "#22C55E";
  if (score >= 70) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function StudentDetailPanel({ student, onClose }) {
  const router = useRouter();

  useEffect(() => {
    if (!student) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [student, onClose]);

  if (!student) return null;

  const courses = buildCourseRows(student);
  const quizzes = student.quizzes ?? [];
  const avg = student.quiz_average ?? (quizzes.length
    ? Math.round(quizzes.reduce((acc, q) => acc + q.score, 0) / quizzes.length)
    : 0);
  const assignments = {
    completed: student.completed_assignments ?? [],
    pending: student.pending_assignments ?? [],
  };

  function handleMessage() {
    onClose?.();
    router.push("/instructor/chat");
  }

  return (
    <AnimatePresence>
      {student && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm md:bg-transparent md:backdrop-blur-0"
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="fixed right-0 top-0 z-[95] flex h-full w-full max-w-sm flex-col border-l border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl md:w-80"
            role="dialog"
            aria-modal="true"
            aria-label="Student details"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#10B981] text-base font-bold text-white">
                  {student.avatar_initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[var(--text-primary)]">
                    {student.name}
                  </p>
                  {student.admission_no && (
                    <p className="truncate font-mono text-xs font-semibold text-[#10B981]">
                      Admission No: {student.admission_no}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
                    Age {student.age} · {student.programme_track}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <Section title="Enrolled Courses">
                {courses.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Not enrolled in any courses.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {courses.map((c) => (
                      <li key={c.course_id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {c.course_title}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-[#10B981] font-mono-ui">
                            {c.progress}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${c.progress}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="h-full bg-[#10B981]"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Quiz Performance">
                <div className="mb-2 flex items-baseline gap-2">
                  <span
                    className="text-3xl font-bold font-mono-ui"
                    style={{ color: quizScoreColor(avg) }}
                  >
                    {avg}%
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-mono-ui">
                    average score
                  </span>
                </div>
                {quizzes.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No quiz attempts yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {quizzes.map((q) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
                      >
                        <span className="truncate text-xs text-[var(--text-primary)]">
                          {q.title}
                        </span>
                        <span
                          className="shrink-0 text-xs font-bold font-mono-ui"
                          style={{ color: quizScoreColor(q.score) }}
                        >
                          {q.score}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Assignments">
                <div className="grid gap-3">
                  <AssignmentList
                    label="Completed"
                    items={assignments.completed}
                    icon={CheckCircle}
                    color="#10B981"
                  />
                  <AssignmentList
                    label="Pending"
                    items={assignments.pending}
                    icon={Clock}
                    color="#F59E0B"
                  />
                </div>
              </Section>

              <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                Last active{" "}
                {student.last_active
                  ? formatDistanceToNow(new Date(student.last_active), {
                      addSuffix: true,
                    })
                  : "Never"}
              </p>
            </div>

            <footer className="border-t border-[var(--border-color)] px-5 py-3">
              <motion.button
                type="button"
                onClick={handleMessage}
                whileTap={{ scale: 0.97 }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
              >
                <MessageSquare className="h-4 w-4" />
                Message Student
              </motion.button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {title}
      </h3>
      {children}
    </section>
  );
}

function AssignmentList({ label, items, icon: Icon, color }) {
  return (
    <div>
      <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-mono-ui" style={{ color }}>
        <Icon className="h-3.5 w-3.5" />
        {label} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">None</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((title) => (
            <li
              key={title}
              className="rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
