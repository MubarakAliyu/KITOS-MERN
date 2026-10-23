"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createSession, updateSession } from "@/_lib/api/sessions";

// Static course list for the mock (the real form would load the instructor's
// courses from the API).
const COURSE_OPTIONS = [
  "Scratch Programming for Beginners",
  "HTML & CSS Fundamentals",
  "Introduction to Python",
];

const DURATIONS = [30, 45, 60, 90, 120];

const schema = z
  .object({
    course: z.string().min(1, "Course is required"),
    title: z.string().trim().min(3, "Title must be at least 3 characters"),
    session_number: z.coerce.number().int().positive().optional().or(z.literal("")),
    date: z.string().min(1, "Date is required"),
    time: z.string().min(1, "Time is required"),
    duration_minutes: z.coerce.number(),
    description: z.string().trim().optional(),
    join_url: z
      .string()
      .trim()
      .url("Enter a valid URL")
      .optional()
      .or(z.literal("")),
    max_students: z.coerce.number().int().positive().optional().or(z.literal("")),
    is_published: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.date && data.time) {
      const when = new Date(`${data.date}T${data.time}`);
      if (when.getTime() < Date.now()) {
        ctx.addIssue({ code: "custom", path: ["date"], message: "Date & time must be in the future" });
      }
    }
  });

// Splits an ISO datetime into the `date` (YYYY-MM-DD) and `time` (HH:mm) parts
// a native date/time input expects, in local time.
function splitDateTime(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const todayDate = () => splitDateTime(new Date().toISOString()).date;

// Shared create + edit modal. Pass `session` to edit (pre-fills), omit to create.
export default function SessionFormModal({ isOpen, onClose, session, onSaved }) {
  const isEdit = !!session;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      course: "",
      title: "",
      session_number: "",
      date: "",
      time: "",
      duration_minutes: 60,
      description: "",
      join_url: "",
      max_students: "",
      is_published: true,
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (session) {
      const { date, time } = splitDateTime(session.scheduled_at);
      reset({
        course: session.course ?? "",
        title: session.title ?? "",
        session_number: session.session_number ?? "",
        date,
        time,
        duration_minutes: session.duration_minutes ?? 60,
        description: session.description ?? "",
        join_url: session.join_url ?? "",
        max_students: session.max_students ?? "",
        is_published: session.is_published ?? true,
      });
    } else {
      reset({
        course: "",
        title: "",
        session_number: "",
        date: "",
        time: "",
        duration_minutes: 60,
        description: "",
        join_url: "",
        max_students: "",
        is_published: true,
      });
    }
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, session, reset, onClose]);

  async function onSubmit(data) {
    const scheduled_at = new Date(`${data.date}T${data.time}`).toISOString();
    const payload = {
      course: data.course,
      title: data.title,
      session_number: data.session_number === "" ? null : Number(data.session_number),
      scheduled_at,
      duration_minutes: Number(data.duration_minutes),
      description: data.description ?? "",
      join_url: data.join_url || null,
      max_students: data.max_students === "" ? null : Number(data.max_students),
      is_published: data.is_published,
    };
    try {
      const saved = isEdit
        ? await updateSession(session.id, payload)
        : await createSession(payload);
      toast.success(isEdit ? "Session updated" : "Session created");
      onSaved?.(saved);
      onClose?.();
    } catch {
      toast.error(isEdit ? "Couldn't update session" : "Couldn't create session");
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
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-0 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? "Edit session" : "Create session"}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {isEdit ? "Edit Session" : "Create Session"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <Field id="s-course" label="Course" error={errors.course?.message}>
                  <select id="s-course" {...register("course")} className={inputClass(errors.course)}>
                    <option value="">Select a course</option>
                    {COURSE_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field id="s-title" label="Session Title" error={errors.title?.message}>
                  <input
                    id="s-title"
                    type="text"
                    placeholder="e.g. Week 3 — Loops & Conditionals"
                    {...register("title")}
                    className={inputClass(errors.title)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-number" label="Session Number (optional)" error={errors.session_number?.message}>
                    <input id="s-number" type="number" min={1} placeholder="3" {...register("session_number")} className={inputClass(errors.session_number)} />
                  </Field>
                  <Field id="s-duration" label="Duration" error={errors.duration_minutes?.message}>
                    <select id="s-duration" {...register("duration_minutes")} className={inputClass(errors.duration_minutes)}>
                      {DURATIONS.map((d) => (
                        <option key={d} value={d}>{d === 90 ? "1h 30min" : d === 120 ? "2h" : `${d} min`}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-date" label="Date" error={errors.date?.message}>
                    <input id="s-date" type="date" min={todayDate()} {...register("date")} className={inputClass(errors.date)} />
                  </Field>
                  <Field id="s-time" label="Time" error={errors.time?.message}>
                    <input id="s-time" type="time" {...register("time")} className={inputClass(errors.time)} />
                  </Field>
                </div>

                <Field id="s-desc" label="Description" error={errors.description?.message}>
                  <textarea
                    id="s-desc"
                    rows={4}
                    placeholder="What will this session cover?"
                    {...register("description")}
                    className={inputClass(errors.description)}
                  />
                </Field>

                <Field id="s-join" label="Join URL (optional)" error={errors.join_url?.message}>
                  <input
                    id="s-join"
                    type="url"
                    placeholder="https://zoom.us/j/… or Google Meet link"
                    {...register("join_url")}
                    className={inputClass(errors.join_url)}
                  />
                  <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                    Auto-filled by the Zoom integration later — manual for now.
                  </p>
                </Field>

                <Field id="s-max" label="Max Students (optional)" error={errors.max_students?.message}>
                  <input id="s-max" type="number" min={1} placeholder="20" {...register("max_students")} className={inputClass(errors.max_students)} />
                </Field>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
                  <input type="checkbox" {...register("is_published")} className="h-4 w-4 accent-[#10B981]" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Make visible to students
                  </span>
                </label>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Save Changes" : "Create Session"}
                </motion.button>
              </footer>
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
      {error && <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>}
    </div>
  );
}

function inputClass(err) {
  return `w-full rounded-xl border bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:outline-none focus:ring-2 ${
    err
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-[var(--border-color)] focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
