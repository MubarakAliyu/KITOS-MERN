"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { X } from "lucide-react";

const ROLE_TONE = {
  admin: { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  instructor: { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  student: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  parent: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
};

const STATUS_TONE = {
  active: { color: "#10B981", bg: "rgba(16,185,129,0.12)", dot: "#10B981" },
  inactive: { color: "#EF4444", bg: "rgba(239,68,68,0.12)", dot: "#EF4444" },
};

function avatarInitial(user) {
  return user.name?.charAt(0).toUpperCase() ?? "?";
}

export default function UserDetailModal({ user, onClose }) {
  useEffect(() => {
    if (!user) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, onClose]);

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
          aria-label="User details"
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
                User Details
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

            <div className="flex flex-col gap-5 px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#10B981] text-xl font-bold text-white">
                  {avatarInitial(user)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[var(--text-primary)]">
                    {user.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={user.role} />
                    <StatusBadge status={user.status} />
                  </div>
                </div>
              </div>

              <dl className="flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-sm">
                <Row label="Email" value={user.email} />
                <Row
                  label="Joined"
                  value={
                    user.created_at
                      ? format(new Date(user.created_at), "MMM d, yyyy")
                      : "—"
                  }
                />
                <Row
                  label="Language"
                  value={user.language_preference === "ha" ? "Hausa" : "English"}
                />
                {user.role === "student" && (
                  <>
                    {user.age && <Row label="Age" value={String(user.age)} />}
                    {user.programme_track && (
                      <Row label="Track" value={user.programme_track} />
                    )}
                  </>
                )}
              </dl>

              {user.role === "student" && (
                <Section title="Enrolled Courses">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {user.enrolled_courses && user.enrolled_courses.length > 0
                      ? user.enrolled_courses.join(", ")
                      : "No enrolled courses"}
                  </p>
                </Section>
              )}
              {user.role === "instructor" && (
                <Section title="Teaching">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {user.teaching_courses && user.teaching_courses.length > 0
                      ? user.teaching_courses.join(", ")
                      : "No courses assigned"}
                  </p>
                </Section>
              )}
              {user.role === "parent" && (
                <Section title="Children">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {user.children && user.children.length > 0
                      ? user.children.join(", ")
                      : "No children registered"}
                  </p>
                </Section>
              )}
            </div>

            <footer className="flex items-center justify-end border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-color)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Close
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
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

function RoleBadge({ role }) {
  const tone = ROLE_TONE[role] ?? ROLE_TONE.student;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: tone.color, backgroundColor: tone.bg }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.active;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: tone.color, backgroundColor: tone.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
      {status}
    </span>
  );
}
