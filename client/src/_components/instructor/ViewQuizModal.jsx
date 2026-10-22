"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { getQuizQuestions } from "@/_lib/api/quizzes";

export default function ViewQuizModal({
  isOpen,
  onClose,
  quizId,
  quizTitle,
}) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !quizId) return;
    setLoading(true);
    getQuizQuestions(quizId)
      .then((data) => {
        setQuestions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn("Failed to fetch quiz questions:", err.message);
        setQuestions([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, quizId]);

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
          aria-label="View quiz questions"
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
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {quizTitle || "Quiz Content"}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Review the questions and answers configured for this quiz.
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

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {loading ? (
                <div className="grid h-48 place-items-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" />
                    <span className="text-xs text-[var(--text-secondary)] font-mono-ui">Loading questions...</span>
                  </div>
                </div>
              ) : questions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-secondary)]">
                  No questions found for this quiz.
                </div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {questions.map((q, i) => (
                    <li
                      key={q.id || i}
                      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                        Question {i + 1}
                      </p>
                      <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">
                        {q.question_text}
                      </h3>

                      {/* Display options if options array exists or build options from answer */}
                      {Array.isArray(q.options) && q.options.length > 0 ? (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {q.options.map((opt, oi) => {
                            const isCorrect = opt.trim().toLowerCase() === (q.correct_answer || "").trim().toLowerCase();
                            return (
                              <div
                                key={oi}
                                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm font-medium ${
                                  isCorrect
                                    ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
                                    : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold font-mono-ui ${
                                    isCorrect ? "bg-[#10B981] text-white" : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                                  }`}>
                                    {String.fromCharCode(65 + oi)}
                                  </span>
                                  <span className="truncate">{opt}</span>
                                </div>
                                {isCorrect && (
                                  <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-[#10B981]/20 bg-[#10B981]/5 px-3 py-2 text-sm">
                          <span className="font-semibold text-[#10B981]">Correct Answer: </span>
                          <span className="text-[var(--text-primary)]">{q.correct_answer}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="flex items-center justify-end border-t border-[var(--border-color)] px-5 py-3 bg-[var(--bg-secondary)]/30">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
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
