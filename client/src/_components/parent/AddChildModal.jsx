"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { addChild } from "@/_lib/api/parents";
import { notifyAdmin } from "@/_lib/notifications/adminNotify";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const TRACKS = ["Scratch Programming", "Web Development", "Robotics Basics"];

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  age: z.coerce.number().int().min(5, "Min age is 5").max(18, "Max age is 18"),
  programme_track: z.enum(TRACKS, {
    message: "Choose a programme track",
  }),
});

export default function AddChildModal({ isOpen, onClose, onCreated }) {
  const { data: session } = useSession();
  const { notify } = useLiveNotify();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", age: "", programme_track: "" },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({ name: "", age: "", programme_track: "" });
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, reset]);

  async function onSubmit(values) {
    try {
      const created = await addChild(values);
      toast.success("Child profile created");
      notifyAdmin("child_registered", {
        parent_name: session?.user?.name ?? "Parent",
        child_name: values.name,
        track: values.programme_track,
      });
      notify("child_registered", {
        child: values.name,
        parent: session?.user?.name ?? "Parent",
      });
      onCreated?.(created);
      onClose?.();
    } catch {
      toast.error("Couldn't create child profile");
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
          aria-label="Add child"
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
                  Add a Child
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Create a learner profile linked to your account.
                </p>
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

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4 px-5 py-5">
              <Field
                id="name"
                label="Child Name"
                error={errors.name?.message}
              >
                <input
                  id="name"
                  type="text"
                  placeholder="e.g. Liam Hassan"
                  {...register("name")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field id="age" label="Age" error={errors.age?.message}>
                <input
                  id="age"
                  type="number"
                  min={5}
                  max={18}
                  placeholder="5–18"
                  {...register("age")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </Field>

              <Field
                id="programme_track"
                label="Programme Track"
                error={errors.programme_track?.message}
              >
                <select
                  id="programme_track"
                  defaultValue=""
                  {...register("programme_track")}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                >
                  <option value="" disabled>
                    Select a track…
                  </option>
                  {TRACKS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
                  Create Child
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
