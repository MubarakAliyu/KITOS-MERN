"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createAssignment } from "@/_lib/api/instructor";
import { getInstructorCourses } from "@/_lib/api/instructor";
import { getCourseModules } from "@/_lib/api/courses";
import RichLessonEditor from "@/_components/editor/RichLessonEditor";

const SUBMISSION_TYPES = [
  {
    key: "text",
    label: "Written Answer",
    description: "Type a response",
    icon: Pencil,
    disabled: false,
  },
  {
    key: "link",
    label: "Link Submission",
    description: "URL to work",
    icon: LinkIcon,
    disabled: false,
  },
  {
    key: "file",
    label: "File Upload",
    description: "Coming soon",
    icon: Upload,
    disabled: true,
  },
];

const GRADE_TYPES = [
  { key: "letter", label: "Letter Grade (A+ → F)" },
  { key: "percentage", label: "Percentage (0–100%)" },
  { key: "pass_fail", label: "Pass / Fail" },
];

const todayISODate = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  // datetime-local needs YYYY-MM-DDTHH:mm in local time.
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

const schema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters"),
    instructions: z
      .string()
      .trim()
      .min(20, "Instructions must be at least 20 characters"),
    submission_types: z
      .array(z.string())
      .min(1, "Select at least one submission type"),
    deadline: z.string().min(1, "Deadline is required"),
    max_score: z.coerce
      .number({ message: "Max score must be a number" })
      .min(10, "Minimum is 10")
      .max(100, "Maximum is 100"),
    grade_type: z.enum(["letter", "percentage", "pass_fail"]),
    allow_late: z.boolean(),
    late_penalty: z.coerce.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.deadline).getTime() < Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline"],
        message: "Deadline must be in the future",
      });
    }
    if (
      data.allow_late &&
      (data.late_penalty === undefined ||
        Number.isNaN(data.late_penalty) ||
        data.late_penalty < 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["late_penalty"],
        message: "Enter a non-negative penalty",
      });
    }
  });

export default function AddAssignmentModal({
  isOpen,
  onClose,
  moduleId,
  moduleTitle,
  courseId,
  courseTitle,
  onCreated,
  onSuccess,
  showModuleSelector = false,
}) {
  // When the modal is opened from the global Assignments page we don't yet
  // know which module the assignment belongs to — render dropdowns so the
  // instructor can pick. Otherwise the props supply the context.
  const [courses, setCourses] = useState([]);
  const [moduleOptions, setModuleOptions] = useState([]);
  const [pickedCourseId, setPickedCourseId] = useState("");
  const [pickedModuleId, setPickedModuleId] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);

  useEffect(() => {
    if (!isOpen || !showModuleSelector) return;
    let cancelled = false;
    setLoadingCourses(true);
    getInstructorCourses()
      .then((list) => {
        if (cancelled) return;
        setCourses(list ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, showModuleSelector]);

  useEffect(() => {
    if (!showModuleSelector) return;
    setPickedModuleId("");
    setModuleOptions([]);
    if (!pickedCourseId) return;
    let cancelled = false;
    setLoadingModules(true);
    getCourseModules(pickedCourseId)
      .then((list) => {
        if (cancelled) return;
        setModuleOptions(list ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingModules(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickedCourseId, showModuleSelector]);

  const effectiveCourseId = showModuleSelector ? pickedCourseId : courseId;
  const effectiveModuleId = showModuleSelector ? pickedModuleId : moduleId;
  const effectiveCourseTitle = showModuleSelector
    ? courses.find((c) => c.id === pickedCourseId)?.title ?? ""
    : courseTitle;
  const effectiveModuleTitle = showModuleSelector
    ? moduleOptions.find((m) => m.id === pickedModuleId)?.title ?? ""
    : moduleTitle;
  const fieldsDisabled = showModuleSelector && !effectiveModuleId;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      instructions: "",
      submission_types: ["text"],
      deadline: "",
      max_score: 100,
      grade_type: "letter",
      allow_late: false,
      late_penalty: 0,
    },
  });

  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    reset({
      title: "",
      instructions: "",
      submission_types: ["text"],
      deadline: "",
      max_score: 100,
      grade_type: "letter",
      allow_late: false,
      late_penalty: 0,
    });
    setShowPreview(false);
    setPickedCourseId("");
    setPickedModuleId("");
    setModuleOptions([]);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, reset]);

  const values = watch();
  const allowLate = values.allow_late;

  async function onSubmit(data) {
    if (showModuleSelector && (!effectiveCourseId || !effectiveModuleId)) {
      toast.error("Pick a course and module first");
      return;
    }
    try {
      const created = await createAssignment({
        ...data,
        module_id: effectiveModuleId,
        course_id: effectiveCourseId,
      });
      toast.success("Assignment created");
      onCreated?.(created);
      onSuccess?.(created);
      onClose?.();
    } catch {
      toast.error("Couldn't create assignment");
    }
  }

  function toggleSubmissionType(key) {
    const current = values.submission_types ?? [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    setValue("submission_types", next, { shouldValidate: true });
  }

  const formattedDeadline = values.deadline
    ? safeFormat(values.deadline, "MMM d, yyyy 'at' h:mm a")
    : "—";

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
          aria-label="Create assignment"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Create Assignment
                </h2>
                {effectiveModuleTitle && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                    <ClipboardList className="h-3 w-3" />
                    {effectiveModuleTitle}
                  </span>
                )}
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

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
                {showModuleSelector && (
                  <Section title="Where does this assignment live?">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="ass-course" label="Course">
                        <select
                          id="ass-course"
                          value={pickedCourseId}
                          onChange={(e) => setPickedCourseId(e.target.value)}
                          className={inputClass(false)}
                          disabled={loadingCourses}
                        >
                          <option value="">
                            {loadingCourses ? "Loading courses…" : "Select a course"}
                          </option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id="ass-module" label="Module">
                        <select
                          id="ass-module"
                          value={pickedModuleId}
                          onChange={(e) => setPickedModuleId(e.target.value)}
                          className={inputClass(false)}
                          disabled={!pickedCourseId || loadingModules}
                        >
                          <option value="">
                            {!pickedCourseId
                              ? "Pick a course first"
                              : loadingModules
                              ? "Loading modules…"
                              : "Select a module"}
                          </option>
                          {moduleOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </Section>
                )}

                <fieldset
                  disabled={fieldsDisabled}
                  className={`flex flex-col gap-6 ${
                    fieldsDisabled ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                <Section title="Basic Info">
                  <Field id="ass-title" label="Assignment Title" error={errors.title?.message}>
                    <input
                      id="ass-title"
                      type="text"
                      placeholder="Build a Simple Animation"
                      {...register("title")}
                      className={inputClass(errors.title)}
                    />
                  </Field>

                  <Field
                    id="ass-instructions"
                    label="Instructions"
                    error={errors.instructions?.message}
                  >
                    <Controller
                      name="instructions"
                      control={control}
                      render={({ field }) => (
                        <div className="rounded-xl border border-[var(--border-color)]">
                          <RichLessonEditor
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="Describe what students need to do..."
                          />
                        </div>
                      )}
                    />
                  </Field>
                </Section>

                <Section title="Submission Settings">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      Accepted Submission Types
                    </span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SUBMISSION_TYPES.map((t) => {
                        const checked = (values.submission_types ?? []).includes(t.key);
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            disabled={t.disabled}
                            onClick={() => toggleSubmissionType(t.key)}
                            className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
                              checked
                                ? "border-[#10B981] bg-[#10B981]/10"
                                : "border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--text-muted)]"
                            } ${t.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            aria-pressed={checked}
                          >
                            <span
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                                checked ? "bg-[#10B981] text-white" : "bg-[var(--bg-secondary)]"
                              }`}
                            >
                              {checked ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : (
                                <Icon className="h-4 w-4" />
                              )}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="text-xs font-bold text-[var(--text-primary)]">
                                {t.label}
                              </span>
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {t.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {errors.submission_types && (
                      <p className="text-xs font-medium text-red-500 font-mono-ui">
                        {errors.submission_types.message}
                      </p>
                    )}
                  </div>
                </Section>

                <Section title="Deadline">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="ass-deadline"
                      label="Due date & time"
                      error={errors.deadline?.message}
                    >
                      <input
                        id="ass-deadline"
                        type="datetime-local"
                        min={todayISODate()}
                        {...register("deadline")}
                        className={inputClass(errors.deadline)}
                      />
                    </Field>
                    <Field
                      id="ass-max"
                      label="Maximum Score"
                      error={errors.max_score?.message}
                    >
                      <input
                        id="ass-max"
                        type="number"
                        min={10}
                        max={100}
                        {...register("max_score")}
                        className={inputClass(errors.max_score)}
                      />
                    </Field>
                  </div>
                </Section>

                <Section title="Grading">
                  <Field id="ass-grade-type" label="Grade Type">
                    <div className="flex flex-col gap-2">
                      {GRADE_TYPES.map((g) => (
                        <label
                          key={g.key}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-color)] px-3 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
                        >
                          <input
                            type="radio"
                            value={g.key}
                            {...register("grade_type")}
                            className="h-4 w-4 accent-[#10B981]"
                          />
                          <span className="text-sm text-[var(--text-primary)]">
                            {g.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </Field>

                  <Field id="ass-late" label="Allow Late Submissions">
                    <Controller
                      name="allow_late"
                      control={control}
                      render={({ field }) => (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={field.value}
                          onClick={() => field.onChange(!field.value)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            field.value
                              ? "bg-[#10B981]"
                              : "border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                          }`}
                        >
                          <motion.span
                            animate={{ x: field.value ? 22 : 2 }}
                            transition={{ type: "spring", stiffness: 320, damping: 26 }}
                            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      )}
                    />
                  </Field>

                  {allowLate && (
                    <Field
                      id="ass-late-penalty"
                      label="Penalty per day late (%)"
                      error={errors.late_penalty?.message}
                    >
                      <input
                        id="ass-late-penalty"
                        type="number"
                        min={0}
                        max={100}
                        {...register("late_penalty")}
                        className={inputClass(errors.late_penalty)}
                      />
                    </Field>
                  )}
                </Section>

                <Section title="Preview">
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
                  >
                    {showPreview ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Hide preview
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Show student preview
                      </>
                    )}
                  </button>
                  <AnimatePresence>
                    {showPreview && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <article className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                          <h3 className="text-xl font-bold text-[var(--text-primary)]">
                            {values.title || "Assignment title"}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)] font-mono-ui">
                            <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5">
                              Due {formattedDeadline}
                            </span>
                            <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5">
                              {values.max_score ?? 100} points
                            </span>
                            <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5">
                              {GRADE_TYPES.find((g) => g.key === values.grade_type)?.label}
                            </span>
                          </div>
                          <div
                            className="prose prose-sm dark:prose-invert mt-3 max-w-none text-sm text-[var(--text-primary)]"
                            // The rich editor stores HTML; preview renders it verbatim
                            // so instructors see exactly what students get.
                            dangerouslySetInnerHTML={{
                              __html:
                                values.instructions ||
                                "<em class='text-[var(--text-muted)]'>Instructions go here…</em>",
                            }}
                          />
                          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono-ui">
                            <FileText className="h-3.5 w-3.5" />
                            Submission via:{" "}
                            {(values.submission_types ?? [])
                              .map(
                                (t) =>
                                  SUBMISSION_TYPES.find((st) => st.key === t)
                                    ?.label
                              )
                              .filter(Boolean)
                              .join(", ") || "None selected"}
                          </p>
                        </article>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Section>
                </fieldset>
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] px-5 py-3">
                <span className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                  {effectiveCourseTitle ? `Course: ${effectiveCourseTitle}` : ""}
                </span>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={isSubmitting || fieldsDisabled}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Assignment
                </motion.button>
              </footer>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {title}
      </h3>
      {children}
    </section>
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

function inputClass(err) {
  return `w-full rounded-xl border bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:outline-none focus:ring-2 ${
    err
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-[var(--border-color)] focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}

function safeFormat(iso, pattern) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, pattern);
}
