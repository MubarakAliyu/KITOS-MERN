"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Plus, UserPlus } from "lucide-react";
import { getChildren, getStudentProgress } from "@/_lib/api/parents";
import AddChildModal from "@/_components/parent/AddChildModal";

const CHILD_AVATAR_BG = {
  s1: "#10B981",
  s2: "#3B82F6",
};

function avatarBg(child) {
  return CHILD_AVATAR_BG[child.id] ?? "#10B981";
}

export default function ParentChildrenPage() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    getChildren()
      .then(setChildren)
      .catch((err) => {
        console.warn("Children fetch failed:", err.message);
        setError("Failed to load children. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  function handleCreated(child) {
    setChildren((list) => [...list, child]);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            My Children
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage learner profiles linked to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAdd(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add Child
        </button>
      </header>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-72 rounded-2xl" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <EmptyState onAdd={() => setOpenAdd(true)} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {children.map((child, i) => (
            <ChildDetailCard key={child.id} child={child} index={i} />
          ))}
        </div>
      )}

      <AddChildModal
        isOpen={openAdd}
        onClose={() => setOpenAdd(false)}
        onCreated={handleCreated}
      />
    </motion.div>
  );
}

function ChildDetailCard({ child, index }) {
  const [progress, setProgress] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getStudentProgress(child.id)
      .then((p) => {
        setProgress(p);
        setLoaded(true);
      })
      .catch((err) => {
        console.warn("Progress fetch failed:", err.message);
        setLoaded(true);
      });
  }, [child.id]);

  const lastActive = progress
    .map((p) => p.last_active)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      whileHover={{ y: -3 }}
      className="flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <header className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-bold text-white shadow-sm"
          style={{ backgroundColor: avatarBg(child) }}
        >
          {child.avatar_initial}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-[var(--text-primary)]">
            {child.name}
          </h2>
          {child.admission_no && (
            <p className="mt-0.5 truncate font-mono text-xs font-semibold text-[#10B981]">
              Admission: {child.admission_no}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
              Age {child.age}
            </span>
            <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
              {child.programme_track}
            </span>
          </div>
        </div>
      </header>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Enrolled Courses
        </h3>
        {!loaded ? (
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-10 rounded-lg" />
            ))}
          </div>
        ) : progress.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            No courses enrolled yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {progress.map((p, i) => (
              <ProgressRow key={p.course_id} item={p} delay={0.15 + i * 0.05} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-5 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
        <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
          Enrolled: <span className="font-bold text-[var(--text-primary)]">{child.enrolled_courses}</span>
          <span className="mx-1.5 text-[var(--text-muted)]">·</span>
          Completed: <span className="font-bold text-[var(--text-primary)]">{child.completed_courses}</span>
        </p>
        <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
          {lastActive
            ? `Last active ${formatDistanceToNow(new Date(lastActive), {
                addSuffix: true,
              })}`
            : "No activity yet"}
        </p>
      </footer>
    </motion.article>
  );
}

function ProgressRow({ item, delay }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {item.course_title}
        </span>
        <span className="shrink-0 text-xs font-bold text-[#10B981] font-mono-ui">
          {item.progress}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${item.progress}%` }}
          transition={{ duration: 0.7, delay, ease: "easeOut" }}
          className="h-full bg-[#10B981]"
        />
      </div>
    </li>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
      >
        Refresh page
      </button>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <UserPlus className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        No children yet — add your first learner to get started.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Add Child
      </button>
    </div>
  );
}
