"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Hash, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createUser, getAdminUsers, getNextAdmissionNo, updateUser } from "@/_lib/api/admin";
import {
  apiErrorMessage,
  apiFieldErrors,
  isTimeoutOrNetworkError,
} from "@/_lib/api/errors";

const ROLES = ["admin", "instructor", "student", "parent"];
const TRACKS = ["Scratch Programming", "Web Development", "Robotics Basics"];

// Students no longer require an email. Email becomes a free-form contact
// field; the admission number is the login identifier.
const schema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().optional().or(z.literal("")),
    role: z.enum(ROLES, { message: "Pick a role" }),
    age: z.coerce.number().optional().or(z.literal(NaN)),
    programme_track: z.string().optional(),
    // A pupil belongs to a family. The API has always required this; the
    // modal never asked for it, so creating a pupil was impossible from
    // here — the request died on `parent_id` after passing every check the
    // form itself made.
    parent_id: z.string().optional(),
    bio: z.string().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "student") {
      const ok = z.string().email().safeParse(data.email).success;
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Enter a valid email",
        });
      }
    } else if (data.email && data.email.length > 0) {
      // Optional, but if provided must still be a real email.
      const ok = z.string().email().safeParse(data.email).success;
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Enter a valid email (or leave blank)",
        });
      }
    }
    if (data.role === "student" && !data.parent_id) {
      ctx.addIssue({
        code: "custom",
        path: ["parent_id"],
        message: "Pick the parent this pupil belongs to",
      });
    }
    if (data.role === "student") {
      if (!data.age || Number.isNaN(data.age) || data.age < 5 || data.age > 18) {
        ctx.addIssue({
          code: "custom",
          path: ["age"],
          message: "Age must be between 5 and 18",
        });
      }
      if (!data.programme_track) {
        ctx.addIssue({
          code: "custom",
          path: ["programme_track"],
          message: "Pick a programme track",
        });
      }
    }
  });

export default function CreateUserModal({
  isOpen,
  onClose,
  onCreated,
  onUpdated,
  defaultValues,
  userToEdit,
  /**
   * Asked whether a name exists, after a write that got no answer. Returns
   * true when the account turned out to have been created. Supplied by the
   * users page, which owns the list and can re-read it.
   */
  onVerifyCreated,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      role: "student",
      age: "",
      programme_track: "",
      parent_id: "",
      bio: "",
    },
  });

  const role = watch("role");
  const [nextAdmissionNo, setNextAdmissionNo] = useState(null);
  const [admissionLoading, setAdmissionLoading] = useState(false);
  const [parents, setParents] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    if (userToEdit) {
      reset({
        name: userToEdit.name ?? "",
        email: userToEdit.email ?? "",
        role: userToEdit.role ?? "student",
        age: userToEdit.age ?? "",
        programme_track: userToEdit.programme_track ?? "",
        parent_id: userToEdit.parent_id ?? "",
        bio: userToEdit.bio ?? "",
      });
    } else {
      reset({
        name: defaultValues?.name ?? "",
        email: defaultValues?.email ?? "",
        role: defaultValues?.role ?? "student",
        age: defaultValues?.age ?? "",
        programme_track: defaultValues?.programme_track ?? "",
        parent_id: defaultValues?.parent_id ?? "",
        bio: "",
      });
    }
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, reset, defaultValues, userToEdit]);

  // The families a pupil can be attached to. Loaded with the admission
  // number, for the same reason: only a pupil needs either.
  useEffect(() => {
    if (!isOpen || role !== "student") return;
    let cancelled = false;
    getAdminUsers()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : rows?.users ?? [];
        setParents(list.filter((u) => u.role === "parent"));
      })
      .catch((err) => console.warn("Parent list fetch failed:", err?.message));
    return () => {
      cancelled = true;
    };
  }, [isOpen, role]);

  // Fetch the next admission number whenever the modal opens for a student
  // (or the role flips to student mid-flow). Other roles never need it.
  useEffect(() => {
    if (!isOpen || role !== "student") return;
    let cancelled = false;
    setAdmissionLoading(true);
    getNextAdmissionNo()
      .then((res) => {
        if (!cancelled) setNextAdmissionNo(res?.next ?? null);
      })
      .catch((err) =>
        console.warn("Next admission no fetch failed:", err?.message)
      )
      .finally(() => {
        if (!cancelled) setAdmissionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, role]);

  /**
   * Only the fields that mean something for the chosen role.
   *
   * The form keeps every field in its state whether or not it is on screen,
   * so an instructor used to be submitted with `age: 0` and
   * `programme_track: ""` — values nobody typed, for inputs the modal hides
   * for that role. The API rejected the age as outside 8 to 18, which it is,
   * and the error named a field the admin could not even see.
   */
  function payloadFor(values) {
    const isStudent = values.role === "student";
    return {
      name: values.name,
      role: values.role,
      // A pupil signs in with an admission number and need not have an
      // address at all; blank means absent, not empty.
      email: values.email?.trim() ? values.email.trim() : null,
      bio: values.bio?.trim() ? values.bio.trim() : null,
      ...(isStudent
        ? {
            age: values.age,
            programme_track: values.programme_track,
            // Only when creating. Moving a child to a different family is a
            // custody decision, not something that should happen as a side
            // effect of correcting a spelling — and the update endpoint
            // rightly does not accept it.
            ...(userToEdit ? {} : { parent_id: values.parent_id }),
          }
        : {}),
    };
  }

  async function onSubmit(values) {
    try {
      const payload = payloadFor(values);

      if (userToEdit) {
        const updated = await updateUser(userToEdit.id, payload);
        toast.success("User updated successfully");
        onUpdated?.(updated);
      } else {
        const created = await createUser({
          ...payload,
          pending_id: defaultValues?.pending_id,
        });
        const idLine = created.admission_no
          ? `Admission No: ${created.admission_no}`
          : created.email;

        /**
         * The password is not in the toast any more.
         *
         * A toast was the wrong container for the only copy of a
         * credential: it is dismissible by accident, stacks behind the
         * next one, and the long description made it a wall of text. The
         * page shows it in `TempPasswordDialog` instead, which closes only
         * on "Done" and has a Copy button. This toast just confirms the
         * account exists.
         */
        toast.success(`User created — ${idLine}`);
        onCreated?.(created);
      }
      onClose?.();
    } catch (error) {
      /**
       * A request that never got an answer is not a request that failed.
       *
       * This is the bug that prompted the change: the account was created,
       * the request then waited on an email Render's free tier cannot send,
       * and the browser timed out first. The administrator was told
       * "Couldn't create user" about a user who existed — and the one-time
       * password went down with the response that never arrived.
       *
       * Nothing waits on email any more, so this should not recur from that
       * cause. It stays because the general case does: a cold server, a lost
       * connection, a slow network. Before calling a write a failure, go and
       * look.
       */
      if (isTimeoutOrNetworkError(error) && !userToEdit) {
        const found = await onVerifyCreated?.(values.name);
        if (found) {
          toast.warning("That account was created", {
            description:
              "The server answered too late to show the temporary password. " +
              "Use \u201cReset password\u201d on their row to issue a new one.",
            duration: Infinity,
            closeButton: true,
          });
          onClose?.();
          return;
        }
      }

      // The server's own field messages, on the inputs and in the toast.
      // "Couldn't create user" was all anyone saw while every admin write in
      // production was failing validation.
      for (const [field, message] of Object.entries(apiFieldErrors(error))) {
        setError(field, { type: "server", message });
      }
      toast.error(
        apiErrorMessage(
          error,
          userToEdit ? "Couldn't update user" : "Couldn't create user"
        )
      );
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
          aria-label="Create user"
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
                {userToEdit ? "Edit User" : "Create User"}
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
              {/*
                Every new account used to be given the same password,
                "default1234", which is printed in this repository's README
                and its handoff document. Anyone who could reach the sign-in
                page and guess an admission number could sign in as a child.
                The API now generates a different random password for each
                account and returns it once, here.
              */}
              {!userToEdit && (
                <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <AlertCircle
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-500"
                    strokeWidth={2.5}
                  />
                  <div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      A temporary password will be generated
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      It is shown to you <strong>once</strong>, when the
                      account is created. Nothing is emailed — send it to
                      them yourself, and copy it before closing the dialog.
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      They must change it the first time they sign in.
                    </p>
                  </div>
                </div>
              )}

              <Field id="cu-name" label="Full Name" error={errors.name?.message}>
                <input
                  id="cu-name"
                  type="text"
                  placeholder="e.g. Liam Hassan"
                  {...register("name")}
                  className={inputClass(errors.name)}
                />
              </Field>

              <Field id="cu-role" label="Role" error={errors.role?.message}>
                <select
                  id="cu-role"
                  {...register("role")}
                  className={inputClass(errors.role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>

              {role === "student" ? (
                <>
                  <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[#10B981]">
                          Admission Number (Auto-generated)
                        </p>
                        <p className="mt-1 font-mono text-2xl font-bold text-[#10B981]">
                          {admissionLoading
                            ? "Loading…"
                            : nextAdmissionNo ?? "—"}
                        </p>
                      </div>
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#10B981]/20">
                        <Hash className="h-6 w-6 text-[#10B981]" />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      This admission number is automatically assigned and
                      cannot be changed. The student will use this to log in.
                    </p>
                  </div>

                  <Field
                    id="cu-email"
                    label="Contact Email (Optional)"
                    error={errors.email?.message}
                  >
                    <input
                      id="cu-email"
                      type="email"
                      placeholder="student@email.com"
                      {...register("email")}
                      className={inputClass(errors.email)}
                    />
                  </Field>

                  <Field id="cu-age" label="Age" error={errors.age?.message}>
                    <input
                      id="cu-age"
                      type="number"
                      min={5}
                      max={18}
                      placeholder="5–18"
                      {...register("age")}
                      className={inputClass(errors.age)}
                    />
                  </Field>
                  <Field
                    id="cu-track"
                    label="Programme Track"
                    error={errors.programme_track?.message}
                  >
                    <select
                      id="cu-track"
                      defaultValue=""
                      {...register("programme_track")}
                      className={inputClass(errors.programme_track)}
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
                  {/*
                    A pupil belongs to a family, and the API has always
                    required it. The modal never asked, so every attempt to
                    create a pupil from this screen failed on `parent_id`
                    after passing every check the form itself made.
                  */}
                  <Field
                    id="cu-parent"
                    label="Parent"
                    error={errors.parent_id?.message}
                  >
                    <select
                      id="cu-parent"
                      defaultValue=""
                      {...register("parent_id")}
                      className={inputClass(errors.parent_id)}
                    >
                      <option value="" disabled>
                        {parents.length === 0
                          ? "No parent accounts yet — create one first"
                          : "Select a parent…"}
                      </option>
                      {parents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.name}
                          {parent.email ? ` · ${parent.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : (
                <Field id="cu-email" label="Email" error={errors.email?.message}>
                  <input
                    id="cu-email"
                    type="email"
                    placeholder="user@kidsintech.school"
                    {...register("email")}
                    className={inputClass(errors.email)}
                  />
                </Field>
              )}

              {role === "instructor" && (
                <Field id="cu-bio" label="Bio (optional)">
                  <textarea
                    id="cu-bio"
                    rows={3}
                    placeholder="Short bio shown to students…"
                    {...register("bio")}
                    className={inputClass(errors.bio)}
                  />
                </Field>
              )}

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
                  {isSubmitting ? "Saving…" : userToEdit ? "Save Changes" : "Create User"}
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

function inputClass(err) {
  return `w-full rounded-xl border bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:outline-none focus:ring-2 ${
    err
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-[var(--border-color)] focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
