"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, ClipboardList, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { getInstructorAssignments } from "@/_lib/api/instructor";
import AssignmentReviewModal from "@/_components/instructor/AssignmentReviewModal";
import AddAssignmentModal from "@/_components/instructor/AddAssignmentModal";
import EditAssignmentModal from "@/_components/instructor/EditAssignmentModal";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending Review" },
  { key: "reviewed", label: "Reviewed" },
];

function deadlineMeta(deadline) {
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 0) return { color: "#EF4444", bg: "rgba(239,68,68,0.12)", label: "Past due" };
  if (days < 3) return { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: `${days}d left` };
  return { color: "#10B981", bg: "rgba(16,185,129,0.12)", label: `${days}d left` };
}

function summarize(assignment) {
  const submissions = assignment.submissions ?? [];
  const reviewed = submissions.filter((s) => s.status === "reviewed").length;
  const pending = submissions.filter((s) => s.status === "submitted").length;
  return { total: submissions.length, reviewed, pending };
}

export default function InstructorAssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <InstructorAssignmentsInner />
    </Suspense>
  );
}

function InstructorAssignmentsInner() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterAssignmentId = searchParams.get("id");
  const cardRefs = useRef({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    getInstructorAssignments()
      .then(setAssignments)
      .catch((err) => {
        console.warn("Assignments fetch failed:", err.message);
        setError("Failed to load assignments. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  // When the user lands here from /instructor/courses with ?id=…, auto-expand
  // the target card, scroll it into view, and flash an amber glow so they can
  // see which assignment they navigated to.
  useEffect(() => {
    if (!filterAssignmentId || loading) return;
    const exists = assignments.some((a) => a.id === filterAssignmentId);
    if (!exists) return;
    setOpenId(filterAssignmentId);
    setHighlightId(filterAssignmentId);
    requestAnimationFrame(() => {
      cardRefs.current[filterAssignmentId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [filterAssignmentId, assignments, loading]);

  const visible = useMemo(() => {
    if (tab === "all") return assignments;
    if (tab === "pending")
      return assignments.filter((a) => summarize(a).pending > 0);
    if (tab === "reviewed")
      return assignments.filter(
        (a) => summarize(a).total > 0 && summarize(a).pending === 0
      );
    return assignments;
  }, [assignments, tab]);

  function handleReviewed({ assignmentId, submissionId, grade, feedback }) {
    setAssignments((list) =>
      list.map((a) =>
        a.id !== assignmentId
          ? a
          : {
              ...a,
              submissions: a.submissions.map((s) =>
                s.id === submissionId
                  ? { ...s, status: "reviewed", grade, feedback }
                  : s
              ),
            }
      )
    );
  }

  function handleCreated(newAssignment) {
    setAssignments((prev) => [newAssignment, ...prev]);
  }

  function handleUpdated(updated) {
    setAssignments((prev) =>
      prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    );
    toast.success("Assignment updated");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Assignments
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Review submissions and leave feedback per student.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={() => setShowCreate(true)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#059669]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Create Assignment
        </motion.button>
      </header>

      <nav role="tablist" className="flex gap-1 border-b border-[var(--border-color)]">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative px-4 py-2.5 text-sm font-semibold transition-colors font-mono-ui ${
                active
                  ? "text-[#10B981]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="instructor-assignments-tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-[#10B981]"
                  transition={{ type: "spring", stiffness: 280, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-28 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              expanded={openId === a.id}
              highlighted={highlightId === a.id}
              cardRef={(node) => {
                if (node) cardRefs.current[a.id] = node;
              }}
              onToggle={() => setOpenId((prev) => (prev === a.id ? null : a.id))}
              onEdit={() => setEditing(a)}
              onReview={(submission) =>
                setReviewing({ assignment: a, submission })
              }
            />
          ))}
        </ul>
      )}

      <AssignmentReviewModal
        isOpen={!!reviewing}
        assignment={reviewing?.assignment}
        submission={reviewing?.submission}
        onClose={() => setReviewing(null)}
        onReviewed={handleReviewed}
      />

      <AddAssignmentModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        showModuleSelector
        onSuccess={handleCreated}
      />

      <EditAssignmentModal
        isOpen={!!editing}
        assignment={editing}
        onClose={() => setEditing(null)}
        onSuccess={handleUpdated}
      />
    </motion.div>
  );
}

// ── Assignment card ──────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  expanded,
  highlighted,
  cardRef,
  onToggle,
  onEdit,
  onReview,
}) {
  const meta = deadlineMeta(assignment.deadline);
  const summary = summarize(assignment);
  const reviewedPct =
    summary.total > 0 ? Math.round((summary.reviewed / summary.total) * 100) : 0;

  return (
    <motion.li
      ref={cardRef}
      animate={
        highlighted
          ? {
              boxShadow: [
                "0 0 0 0 rgba(245,158,11,0)",
                "0 0 0 6px rgba(245,158,11,0.35)",
                "0 0 0 0 rgba(245,158,11,0)",
              ],
            }
          : { boxShadow: "0 0 0 0 rgba(245,158,11,0)" }
      }
      transition={{ duration: 2 }}
      className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      <div className="flex items-start justify-between gap-3 p-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 flex-col gap-3 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {assignment.title}
                </h3>
                {assignment.course_title && (
                  <span className="rounded-full bg-[#10B981]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                    {assignment.course_title}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)] font-mono-ui">
                Due {assignment.deadline}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                style={{ color: meta.color, backgroundColor: meta.bg }}
              >
                {meta.label}
              </span>
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="grid h-7 w-7 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-[var(--text-secondary)] font-mono-ui">
              {summary.total} submitted · {summary.reviewed} reviewed ·{" "}
              {summary.pending} pending
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${reviewedPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full bg-[#10B981]"
              />
            </div>
          </div>
        </button>
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Edit assignment"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-[var(--border-color)]"
          >
            <SubmissionList
              submissions={assignment.submissions}
              onReview={onReview}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function SubmissionList({ submissions, onReview }) {
  if (!submissions || submissions.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">
        No submissions yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--border-color)]">
      {submissions.map((s) => (
        <SubmissionRow key={s.id} submission={s} onReview={() => onReview(s)} />
      ))}
    </ul>
  );
}

function SubmissionRow({ submission, onReview }) {
  const initial = submission.student_name?.charAt(0)?.toUpperCase() ?? "?";
  const reviewed = submission.status === "reviewed";

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#10B981] text-xs font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {submission.student_name}
        </p>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">
          Submitted{" "}
          {formatDistanceToNow(new Date(submission.submitted_at), {
            addSuffix: true,
          })}
        </p>
      </div>
      {reviewed ? (
        <>
          {submission.grade && (
            <span className="rounded-full bg-[#10B981] px-2.5 py-0.5 text-[10px] font-bold text-white font-mono-ui">
              {submission.grade}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
            style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)" }}
          >
            Reviewed
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        </>
      ) : (
        <>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
            style={{ color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.12)" }}
          >
            Submitted
          </span>
          <button
            type="button"
            onClick={onReview}
            className="rounded-lg border border-[#10B981] px-3 py-1.5 text-xs font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
          >
            Review
          </button>
        </>
      )}
    </li>
  );
}

function EmptyState({ tab }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <ClipboardList className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        Nothing in{" "}
        <span className="font-semibold text-[var(--text-primary)]">{tab}</span>{" "}
        right now.
      </p>
    </div>
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
