"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deactivateUser } from "@/_lib/api/admin";

export default function DeactivateConfirmModal({
  user,
  onClose,
  onDeactivated,
}) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, onClose]);

  async function handleConfirm() {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      await deactivateUser(user.id);
      toast.success("User deactivated");
      onDeactivated?.(user.id);
      onClose?.();
    } catch {
      toast.error("Couldn't deactivate user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm deactivation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-red-500/15 text-red-500">
              <AlertCircle className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-[var(--text-primary)]">
              Deactivate {user.name}?
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              This will prevent them from logging in. You can reactivate later
              from the same row.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, Deactivate
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
