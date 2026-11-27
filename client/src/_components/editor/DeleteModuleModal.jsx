"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteModule } from "@/_lib/api/courses";
import { apiErrorMessage } from "@/_lib/api/errors";

/**
 * Deleting a module, and saying what goes with it.
 *
 * The editor used to delete modules with `window.confirm` and then only from
 * the page's own state: the row disappeared, a toast said "Module deleted",
 * and the module was still there after a reload. Nothing was ever sent.
 *
 * Now it calls the API — which removes the module's lessons, quizzes,
 * assignments and the students' submissions in one transaction — so the
 * confirmation has to name that, and ask for a tick rather than accept a
 * stray press of Enter on a browser dialog.
 */
export default function DeleteModuleModal({ module, onClose, onDeleted }) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!module) return;
    setConfirmed(false);
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [module, onClose]);

  async function handleConfirm() {
    if (!module || !confirmed || submitting) return;
    setSubmitting(true);
    try {
      await deleteModule(module.id);
      onDeleted?.(module);
      toast.success("Module deleted");
      onClose?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't delete module"));
    } finally {
      setSubmitting(false);
    }
  }

  const lessonCount = module?.lessons_count ?? module?.lessons?.length ?? 0;

  return (
    <AnimatePresence>
      {module && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete module"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-red-500">
              <AlertTriangle className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <h2 className="mt-4 text-center text-lg font-bold text-[var(--text-primary)]">
              Delete Module
            </h2>

            <div className="mt-4 rounded-lg bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
              <p>You are about to delete:</p>
              <p className="mt-1 font-bold text-[var(--text-primary)]">
                {module.title}
              </p>
            </div>

            <p className="mt-4 text-xs text-[var(--text-secondary)]">
              This cannot be undone.{" "}
              {lessonCount > 0
                ? `Its ${lessonCount} lesson${lessonCount === 1 ? "" : "s"} go with it, `
                : "Everything inside it goes with it, "}
              along with any quiz, assignment and the work students have
              already submitted against them.
            </p>

            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2.5 text-xs">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="accent-red-500"
              />
              <span className="text-[var(--text-primary)]">
                I understand this cannot be undone
              </span>
            </label>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!confirmed || submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete Module
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
