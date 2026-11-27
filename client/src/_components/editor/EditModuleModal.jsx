"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { updateModule } from "@/_lib/api/courses";
import { apiErrorMessage, apiFieldErrors } from "@/_lib/api/errors";

/**
 * Renaming a module, describing it, and moving it in the running order.
 *
 * None of this was possible before: a module could be created and deleted,
 * and that was all. A typo in a module title meant deleting the module — and
 * with it every lesson, quiz, assignment and submission underneath — and
 * building it again.
 */
const schema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters"),
  description: z.string().trim().max(2000).optional(),
  order_index: z.coerce.number().int().min(1, "Order must be at least 1"),
});

export default function EditModuleModal({ module, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", order_index: 1 },
  });

  useEffect(() => {
    if (!module) return;
    reset({
      title: module.title ?? "",
      description: module.description ?? "",
      order_index: module.order_index ?? 1,
    });
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [module, onClose, reset]);

  async function onSubmit(values) {
    try {
      const saved = await updateModule(module.id, values);
      toast.success("Module saved");
      onSaved?.(saved);
      onClose?.();
    } catch (error) {
      for (const [field, message] of Object.entries(apiFieldErrors(error))) {
        setError(field, { type: "server", message });
      }
      toast.error(apiErrorMessage(error, "Couldn't save module"));
    }
  }

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
          aria-label="Edit module"
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
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Edit Module
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="flex flex-col gap-4 px-5 py-5"
            >
              <Field
                id="edit-mod-title"
                label="Module Title"
                error={errors.title?.message}
              >
                <input
                  id="edit-mod-title"
                  type="text"
                  {...register("title")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field
                id="edit-mod-desc"
                label="Description"
                error={errors.description?.message}
              >
                <textarea
                  id="edit-mod-desc"
                  rows={3}
                  placeholder="What this module covers"
                  {...register("description")}
                  className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field
                id="edit-mod-order"
                label="Order Index"
                error={errors.order_index?.message}
              >
                <input
                  id="edit-mod-order"
                  type="number"
                  min={1}
                  {...register("order_index")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
                <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                  Modules swap places. Giving this the number another module
                  holds moves that one here.
                </p>
              </Field>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Module
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ id, label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-semibold text-[var(--text-primary)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>
      )}
    </div>
  );
}
