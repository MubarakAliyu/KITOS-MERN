"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createLesson } from "@/_lib/api/instructor";

const CONTENT_TYPES = ["video", "text", "file", "link"];

const schema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters"),
    content_type: z.enum(CONTENT_TYPES, { message: "Pick a content type" }),
    youtube_url: z.string().trim().optional().or(z.literal("")),
    body_content: z.string().optional().or(z.literal("")),
    order_index: z.coerce.number().int().min(1, "Order must be ≥ 1"),
  })
  .refine(
    (v) => {
      if (v.content_type !== "video") return true;
      return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(
        v.youtube_url || ""
      );
    },
    { message: "Enter a valid YouTube URL", path: ["youtube_url"] }
  );

export default function AddLessonModal({
  isOpen,
  onClose,
  moduleId,
  onCreated,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      content_type: "video",
      youtube_url: "",
      body_content: "",
      order_index: 1,
    },
  });

  const contentType = watch("content_type");

  useEffect(() => {
    if (!isOpen) return;
    reset({
      title: "",
      content_type: "video",
      youtube_url: "",
      body_content: "",
      order_index: 1,
    });
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, reset]);

  async function onSubmit(values) {
    try {
      const created = await createLesson({
        ...values,
        module_id: moduleId,
      });
      toast.success("Lesson added");
      onCreated?.(created);
      onClose?.();
    } catch {
      toast.error("Couldn't add lesson");
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
          aria-label="Add lesson"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Add a Lesson
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
              className="flex flex-col gap-4 overflow-y-auto px-5 py-5"
            >
              <Field id="ls-title" label="Title" error={errors.title?.message}>
                <input
                  id="ls-title"
                  type="text"
                  placeholder="e.g. What is Scratch?"
                  {...register("title")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field
                id="ls-type"
                label="Content Type"
                error={errors.content_type?.message}
              >
                <select
                  id="ls-type"
                  {...register("content_type")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                >
                  {CONTENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              {contentType === "video" && (
                <Field
                  id="ls-yt"
                  label="YouTube URL"
                  error={errors.youtube_url?.message}
                >
                  <input
                    id="ls-yt"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    {...register("youtube_url")}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                  />
                </Field>
              )}

              <Field id="ls-body" label="Body Content">
                <textarea
                  id="ls-body"
                  rows={4}
                  placeholder="Lesson notes, transcript, or supporting copy…"
                  {...register("body_content")}
                  className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field
                id="ls-order"
                label="Order Index"
                error={errors.order_index?.message}
              >
                <input
                  id="ls-order"
                  type="number"
                  min={1}
                  {...register("order_index")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
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
                  Add Lesson
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
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>
      )}
    </div>
  );
}
