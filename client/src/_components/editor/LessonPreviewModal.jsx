"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, X } from "lucide-react";
import { PreviewPane } from "@/_components/editor/RichLessonEditor";

function youtubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s/]+)/
  );
  return match ? match[1] : null;
}

export default function LessonPreviewModal({ lesson, onClose }) {
  useEffect(() => {
    if (!lesson) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lesson, onClose]);

  const ytId = youtubeId(lesson?.youtube_url);

  return (
    <AnimatePresence>
      {lesson && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-stretch bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Lesson preview"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-[90vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono-ui">
                  <Eye className="h-3 w-3" />
                  Student Preview
                </span>
                <h2 className="mt-2 truncate text-lg font-bold text-[var(--text-primary)]">
                  {lesson.title}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)] font-mono-ui">
                  This is how students see this lesson.
                </p>
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

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {ytId && (
                <div className="mb-5 overflow-hidden rounded-xl">
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "56.25%",
                      height: 0,
                    }}
                  >
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        border: 0,
                      }}
                      allowFullScreen
                      title={lesson.title}
                    />
                  </div>
                </div>
              )}
              <h1 className="mb-4 text-2xl font-bold text-[var(--text-primary)]">
                {lesson.title}
              </h1>
              <PreviewPane html={lesson.body_content ?? ""} />
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                disabled
                className="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] font-mono-ui opacity-60"
              >
                ← Previous Lesson
              </button>
              <p className="hidden text-[11px] text-[var(--text-muted)] font-mono-ui sm:block">
                Navigation active in student view
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] font-mono-ui opacity-60"
                >
                  Mark Complete
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] font-mono-ui opacity-60"
                >
                  Next Lesson →
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
