"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createQuiz } from "@/_lib/api/instructor";

const LETTERS = ["A", "B", "C", "D"];

function blankQuestion() {
  return {
    question_text: "",
    options: ["", "", "", ""],
    correct_letter: "A",
  };
}

export default function AddQuizModal({
  isOpen,
  onClose,
  moduleId,
  onCreated,
}) {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setQuestions([blankQuestion()]);
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  function updateQuestion(i, patch) {
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q))
    );
  }

  function updateOption(qi, oi, value) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) }
          : q
      )
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }

  function removeQuestion(i) {
    setQuestions((qs) => (qs.length === 1 ? qs : qs.filter((_, idx) => idx !== i)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (title.trim().length < 2) {
      toast.error("Quiz title is required");
      return;
    }
    for (const [i, q] of questions.entries()) {
      if (q.question_text.trim().length < 2) {
        toast.error(`Question ${i + 1} is empty`);
        return;
      }
      if (q.options.some((o) => !o.trim())) {
        toast.error(`Question ${i + 1} needs all 4 options filled`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        module_id: moduleId,
        title: title.trim(),
        questions: questions.map((q) => ({
          question_text: q.question_text.trim(),
          question_type: "mcq",
          options: q.options.map((o) => o.trim()),
          correct_answer: q.options[LETTERS.indexOf(q.correct_letter)].trim(),
        })),
      };
      const created = await createQuiz(payload);
      toast.success("Quiz created");
      onCreated?.(created);
      onClose?.();
    } catch {
      toast.error("Couldn't create quiz");
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
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Add quiz"
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
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Add a Quiz
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
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="qz-title" className="text-sm font-semibold text-[var(--text-primary)]">
                  Quiz Title
                </label>
                <input
                  id="qz-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scratch Basics Quiz"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>

              <ul className="flex flex-col gap-3">
                {questions.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                        Question {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        disabled={questions.length === 1}
                        aria-label="Delete question"
                        className="grid h-7 w-7 place-items-center rounded-full text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={q.question_text}
                      onChange={(e) =>
                        updateQuestion(i, { question_text: e.target.value })
                      }
                      placeholder="Question text"
                      className="mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                    />

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <label
                          key={oi}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#10B981]/10 text-[11px] font-bold text-[#10B981] font-mono-ui">
                            {LETTERS[oi]}
                          </span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(i, oi, e.target.value)}
                            placeholder={`Option ${LETTERS[oi]}`}
                            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
                        Correct answer:
                      </span>
                      <select
                        value={q.correct_letter}
                        onChange={(e) =>
                          updateQuestion(i, { correct_letter: e.target.value })
                        }
                        className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-bold text-[var(--text-primary)] font-mono-ui focus:border-[#10B981] focus:outline-none"
                      >
                        {LETTERS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-dashed border-[#10B981]/40 bg-[#10B981]/5 px-3 py-2 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add Question
              </button>
            </form>

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
                Create Quiz
              </motion.button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
