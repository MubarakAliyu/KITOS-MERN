"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { assignInstructor } from "@/_lib/api/admin";

export default function AssignInstructorModal({
  isOpen,
  onClose,
  user,
  courses,
  onAssigned,
}) {
  const [courseId, setCourseId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCourseId("");
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  async function handleAssign() {
    if (!courseId) {
      toast.error("Pick a course first");
      return;
    }
    setSubmitting(true);
    try {
      await assignInstructor({
        instructor_id: user?.id,
        course_id: courseId,
      });
      toast.success("Instructor assigned");
      onAssigned?.(user?.id, courseId);
      onClose?.();
    } catch {
      toast.error("Couldn't assign instructor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Assign instructor to course"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Assign to Course
                </h2>
                {user && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)] font-mono-ui">
                    {user.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-col gap-4 px-5 py-5">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="ai-course"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Course
                </label>
                <select
                  id="ai-course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                >
                  <option value="" disabled>
                    Select a course…
                  </option>
                  {(courses ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={handleAssign}
                whileTap={{ scale: 0.97 }}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Assign
              </motion.button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
