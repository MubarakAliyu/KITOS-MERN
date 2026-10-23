"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getQuizQuestions, submitQuiz } from "@/_lib/api/quizzes";
import { useCountUp } from "@/_hooks/useCountUp";

export default function QuizPlayer({ quizId, onClose, onComplete }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId → answer string
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { score, total, percentage }

  useEffect(() => {
    getQuizQuestions(quizId)
      .then(setQuestions)
      .finally(() => setLoading(false));
  }, [quizId]);

  const current = questions[index];
  const selected = current ? answers[current.id] : null;
  const isLast = index === questions.length - 1;
  const progressPct = questions.length
    ? Math.round(((index + 1) / questions.length) * 100)
    : 0;

  async function handleNext() {
    if (!selected) return;
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    try {
      const r = await submitQuiz({ quiz_id: quizId, answers });
      setResult(r);
      toast.success(`Quiz complete! You scored ${r.percentage}%`);
    } catch {
      toast.error("Couldn't submit quiz");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {result ? "Quiz results" : "Quiz"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quiz"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" />
          </div>
        ) : result ? (
          <ResultsScreen
            result={result}
            questions={questions}
            answers={answers}
            onComplete={() => {
              onComplete?.();
              onClose?.();
            }}
          />
        ) : current ? (
          <>
            <ProgressBar percent={progressPct} index={index + 1} total={questions.length} />
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-5 py-6 sm:px-6"
              >
                <p className="text-base font-semibold text-[var(--text-primary)] sm:text-lg">
                  {current.question_text}
                </p>
                <ul className="mt-5 flex flex-col gap-2">
                  {current.options.map((opt) => (
                    <OptionButton
                      key={opt}
                      option={opt}
                      selected={selected === opt}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [current.id]: opt }))
                      }
                    />
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
            <footer className="flex items-center justify-end border-t border-[var(--border-color)] px-5 py-3">
              <motion.button
                type="button"
                onClick={handleNext}
                disabled={!selected || submitting}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLast ? "Submit Quiz" : "Next"}
              </motion.button>
            </footer>
          </>
        ) : null}
      </motion.div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    >
      {children}
    </motion.div>
  );
}

function ProgressBar({ percent, index, total }) {
  return (
    <div className="border-b border-[var(--border-color)] px-5 py-3">
      <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
        Question {index} of {total}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="h-full bg-[#10B981]"
        />
      </div>
    </div>
  );
}

function OptionButton({ option, selected, onClick }) {
  return (
    <li>
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.99 }}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
          selected
            ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
            : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[#10B981]/60"
        }`}
      >
        <span>{option}</span>
        {selected && (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#10B981] text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </motion.button>
    </li>
  );
}

function verdict(percentage) {
  if (percentage >= 80) return "Excellent!";
  if (percentage >= 50) return "Good try!";
  return "Keep practicing";
}

function ResultsScreen({ result, questions, answers, onComplete }) {
  const animatedPct = useCountUp(result.percentage);

  return (
    <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <ScoreCircle percent={result.percentage} animatedPct={animatedPct} />
        <p className="text-base font-semibold text-[var(--text-primary)]">
          {result.score} / {result.total} Correct
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{verdict(result.percentage)}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {questions.map((q, i) => {
          const correct = answers[q.id] === q.correct_answer;
          return (
            <li
              key={q.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
            >
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white font-mono-ui ${
                  correct ? "bg-[#10B981]" : "bg-red-500"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {q.question_text}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Your answer:{" "}
                  <span className={correct ? "text-[#10B981]" : "text-red-500"}>
                    {answers[q.id] ?? "—"}
                  </span>
                  {!correct && (
                    <>
                      {" · "}
                      Correct:{" "}
                      <span className="text-[#10B981]">{q.correct_answer}</span>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onComplete}
        className="w-full rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        Close
      </button>
    </div>
  );
}

function ScoreCircle({ percent, animatedPct }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--bg-secondary)"
          strokeWidth="8"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#10B981"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <span className="text-3xl font-bold text-[var(--text-primary)]">{animatedPct}%</span>
    </div>
  );
}
