"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { useSession } from "next-auth/react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { submitFeedback } from "@/_lib/api/instructor";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const GRADES = ["A+", "A", "B+", "B", "C", "D", "F"];

export default function AssignmentReviewModal({
  isOpen,
  assignment,
  submission,
  onClose,
  onReviewed,
}) {
  const { notify } = useLiveNotify();
  const { data: session } = useSession();
  const [grade, setGrade] = useState("A");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setGrade("A");
    setFeedback("");
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, submission?.id]);

  if (!assignment || !submission) return null;

  async function handleSubmit() {
    if (feedback.trim().length < 10) {
      toast.error("Feedback must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    const reviewedAt = new Date().toISOString();
    const reviewerName = session?.user?.name ?? "Instructor";
    try {
      await submitFeedback(assignment.id, {
        submission_id: submission.id,
        grade,
        feedback: feedback.trim(),
        reviewed_at: reviewedAt,
        reviewer_name: reviewerName,
        assignment_title: assignment.title,
        student_id: submission.student_id,
      });
      notify("feedback_submitted", {
        student: submission.student_name ?? "student",
      });
      onReviewed?.({
        assignmentId: assignment.id,
        submissionId: submission.id,
        grade,
        feedback: feedback.trim(),
        reviewed_at: reviewedAt,
        reviewer_name: reviewerName,
      });
      onClose?.();
    } catch {
      toast.error("Couldn't submit feedback");
    } finally {
      setSubmitting(false);
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
          aria-label="Review submission"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                  {assignment.course_title}
                </p>
                <h2 className="mt-0.5 truncate text-lg font-bold text-[var(--text-primary)]">
                  {assignment.title}
                </h2>
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

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
              <StudentRow submission={submission} />

              <SubmissionContent submission={submission} />

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="rev-grade"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Grade
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GRADES.map((g) => {
                    const active = g === grade;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGrade(g)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-bold font-mono-ui transition-colors ${
                          active
                            ? "border-[#10B981] bg-[#10B981] text-white"
                            : "border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rev-feedback"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Feedback
                </label>
                <textarea
                  id="rev-feedback"
                  rows={5}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write detailed feedback..."
                  className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
                <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                  {feedback.length} characters · min 10
                </p>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={handleSubmit}
                whileTap={{ scale: 0.97 }}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Feedback
              </motion.button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StudentRow({ submission }) {
  const initial = submission.student_name?.charAt(0)?.toUpperCase() ?? "?";
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#10B981] text-sm font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">
          {submission.student_name}
        </p>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">
          Submitted{" "}
          {formatDistanceToNow(new Date(submission.submitted_at), {
            addSuffix: true,
          })}
        </p>
      </div>
    </div>
  );
}

function SubmissionContent({ submission }) {
  if (submission.submission_type === "link") {
    return (
      <div className="rounded-lg border-l-4 border-[#3B82F6] bg-[var(--bg-secondary)] p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Submitted Link
        </p>
        <div className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]" />
          <span className="break-all">{submission.content}</span>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)] font-mono-ui">
          Click below to view the student&apos;s work.
        </p>
        <button
          type="button"
          onClick={() =>
            window.open(submission.content, "_blank", "noopener,noreferrer")
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/10"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Link →
        </button>
      </div>
    );
  }

  if (submission.submission_type === "file") {
    return (
      <div className="rounded-lg border-l-4 border-[var(--text-secondary)] bg-[var(--bg-secondary)] p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          File Submission
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
          onClick={() => {}}
        >
          <Download className="h-4 w-4" />
          Download submission
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-l-4 border-[#10B981] bg-[var(--bg-secondary)] p-4">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        <FileText className="h-3 w-3" />
        Written Answer
      </p>
      <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
        {submission.content}
      </p>
    </div>
  );
}
