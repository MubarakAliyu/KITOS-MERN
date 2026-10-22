"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Star,
} from "lucide-react";
import {
  getLesson,
  getModuleLessons,
  markLessonComplete,
} from "@/_lib/api/lessons";

// Confetti burst particles. Variety comes from icon, hue, and animation
// offset — no emoji glyphs.
const CONFETTI = [
  { Icon: Sparkles, color: "#10B981" },
  { Icon: Star, color: "#F59E0B" },
  { Icon: Sparkles, color: "#3B82F6" },
  { Icon: Star, color: "#10B981" },
  { Icon: Sparkles, color: "#F59E0B" },
  { Icon: Star, color: "#8B5CF6" },
  { Icon: Sparkles, color: "#EF4444" },
];

function extractYouTubeId(url) {
  if (!url) return "";
  // ?v= form
  const vMatch = url.match(/[?&]v=([^&]+)/);
  if (vMatch) return vMatch[1];
  // youtu.be/ID form
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return shortMatch[1];
  // /embed/ID form (already an embed URL)
  const embedMatch = url.match(/\/embed\/([^?&]+)/);
  if (embedMatch) return embedMatch[1];
  return "";
}

export default function LessonViewerPage({ params }) {
  const { lessonId } = use(params);

  const [lesson, setLesson] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCompleted(false);
    getLesson(lessonId)
      .then(async (l) => {
        setLesson(l);
        setCompleted(l.completed || false);
        const list = await getModuleLessons(l.module_id);
        setSiblings(list);
      })
      .finally(() => setLoading(false));
  }, [lessonId]);

  if (loading || !lesson) return <LessonSkeleton />;

  const videoId = extractYouTubeId(lesson.youtube_url);
  const currentIndex = siblings.findIndex((s) => s.id === lesson.id);
  const prev = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const next = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  async function handleMarkComplete() {
    if (completed || marking) return;
    setMarking(true);
    try {
      await markLessonComplete(lesson.id);
      setCompleted(true);
      setShowConfetti(true);
      toast.success("Lesson completed");
      setTimeout(() => setShowConfetti(false), 1600);
    } catch {
      toast.error("Couldn't mark complete");
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {showConfetti && <ConfettiBurst />}

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-5">
        <Breadcrumb lesson={lesson} />

        {videoId ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={lesson.title}
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="grid aspect-video place-items-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
            No video available
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {lesson.title}
        </h1>
        <p className="whitespace-pre-line text-sm text-[var(--text-secondary)] sm:text-base">
          {lesson.body_content}
        </p>

        <div className="border-t border-[var(--border-color)] pt-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            {prev ? (
              <Link
                href={`/student/lessons/${prev.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Link>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={marking || completed}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                completed
                  ? "bg-[#10B981]/15 text-[#10B981]"
                  : "bg-[#10B981] text-white hover:bg-[#059669]"
              } disabled:cursor-not-allowed`}
            >
              {marking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : completed ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : null}
              {completed ? "Completed" : "Mark Complete"}
            </button>

            {next ? (
              <Link
                href={`/student/lessons/${next.id}`}
                className="inline-flex items-center justify-end gap-2 rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <aside className="hidden lg:block lg:w-72 lg:shrink-0">
        <div className="sticky top-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            In this module
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)] font-mono-ui">
            {lesson.module_title}
          </p>
          <ul className="mt-4 flex flex-col gap-1">
            {siblings.map((s) => {
              const Icon = s.content_type === "video" ? Play : FileText;
              const isCurrent = s.id === lesson.id;
              const isDone = s.completed;
              return (
                <li key={s.id}>
                  <Link
                    href={`/student/lessons/${s.id}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isCurrent
                        ? "bg-[#10B981]/10 text-[#10B981]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isCurrent ? "text-[#10B981]" : "text-[var(--text-secondary)]"
                      }`}
                      strokeWidth={2.2}
                    />
                    <span className="flex-1 truncate">{s.title}</span>
                    {isDone && <CheckCircle className="h-3.5 w-3.5 text-[#10B981]" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Breadcrumb({ lesson }) {
  return (
    <nav className="text-xs text-[var(--text-secondary)] font-mono-ui">
      <Link href="/student/courses" className="hover:text-[var(--text-primary)]">
        My Courses
      </Link>
      <span className="mx-2">›</span>
      <Link
        href={`/student/courses/${lesson.course_id}`}
        className="hover:text-[var(--text-primary)]"
      >
        {lesson.course_title}
      </Link>
      <span className="mx-2">›</span>
      <span>{lesson.module_title}</span>
      <span className="mx-2">›</span>
      <span className="text-[var(--text-primary)]">{lesson.title}</span>
    </nav>
  );
}

function ConfettiBurst() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      <AnimatePresence>
        {CONFETTI.map(({ Icon, color }, i) => (
          <motion.span
            key={i}
            className="absolute"
            style={{ left: `${10 + ((i * 13) % 80)}%`, top: "55%", color }}
            initial={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
              y: -260 - (i % 3) * 40,
              x: (i % 2 === 0 ? 1 : -1) * (40 + i * 8),
              opacity: 0,
              rotate: i % 2 === 0 ? 180 : -180,
              scale: 1.4,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, delay: i * 0.05, ease: "easeOut" }}
          >
            <Icon className="h-7 w-7" strokeWidth={2.4} />
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="skeleton-shimmer h-4 w-64 rounded" />
      <div className="skeleton-shimmer aspect-video w-full rounded-2xl" />
      <div className="skeleton-shimmer h-8 w-2/3 rounded" />
      <div className="skeleton-shimmer h-4 w-full rounded" />
      <div className="skeleton-shimmer h-4 w-5/6 rounded" />
    </div>
  );
}
