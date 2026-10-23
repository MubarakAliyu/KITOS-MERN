"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { sendAnnouncement } from "@/_lib/api/admin";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";

const TARGETS = [
  { key: "all", label: "All Users", count: 7 },
  { key: "students", label: "Students Only", count: 3 },
  { key: "parents", label: "Parents Only", count: 1 },
  { key: "instructors", label: "Instructors Only", count: 2 },
  { key: "course", label: "Specific Course", count: null },
];

const MESSAGE_MAX = 500;

export default function AnnouncementModal({ isOpen, onClose, courses }) {
  const [target, setTarget] = useState("all");
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useLiveNotify();

  useEffect(() => {
    if (!isOpen) return;
    setTarget("all");
    setCourseId("");
    setTitle("");
    setMessage("");
    setPriority(false);
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const audienceCount =
    target === "course"
      ? courses?.find((c) => c.id === courseId)?.students_count ?? 0
      : TARGETS.find((t) => t.key === target)?.count ?? 0;

  async function handleSubmit() {
    if (title.trim().length < 5) {
      toast.error("Title must be at least 5 characters");
      return;
    }
    if (message.trim().length < 20) {
      toast.error("Message must be at least 20 characters");
      return;
    }
    if (target === "course" && !courseId) {
      toast.error("Pick a course first");
      return;
    }

    setSubmitting(true);
    try {
      const res = await sendAnnouncement({
        target,
        course_id: target === "course" ? courseId : undefined,
        title: title.trim(),
        message: message.trim(),
        priority,
      });
      const count = res?.sent_count ?? audienceCount;
      notify("announcement_sent", { count });
      onClose?.();
    } catch {
      toast.error("Couldn't send announcement");
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
          aria-label="Send announcement"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Send Announcement
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

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
              <section className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[var(--text-primary)]">
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TARGETS.map((t) => {
                    const active = target === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTarget(t.key)}
                        aria-pressed={active}
                        className={`rounded-xl border p-3 text-left text-xs font-semibold transition-colors ${
                          active
                            ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
                            : "border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                        }`}
                      >
                        <p>{t.label}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                          {t.count != null ? `${t.count} users` : "select course"}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {target === "course" && (
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                  >
                    <option value="" disabled>
                      Select a course…
                    </option>
                    {(courses ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.students_count} students)
                      </option>
                    ))}
                  </select>
                )}
              </section>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="ann-title" className="text-sm font-semibold text-[var(--text-primary)]">
                  Announcement Title
                </label>
                <input
                  id="ann-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short headline (min 5 chars)"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="ann-message" className="text-sm font-semibold text-[var(--text-primary)]">
                    Message
                  </label>
                  <span
                    className={`text-[11px] font-mono-ui ${
                      message.length > MESSAGE_MAX
                        ? "text-red-500"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {message.length} / {MESSAGE_MAX}
                  </span>
                </div>
                <textarea
                  id="ann-message"
                  rows={4}
                  maxLength={MESSAGE_MAX}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What would you like to announce?"
                  className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={priority}
                  onChange={(e) => setPriority(e.target.checked)}
                  className="accent-[#10B981]"
                />
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                  Mark as important
                  <Bell className="h-3.5 w-3.5 text-amber-500" />
                </span>
              </label>

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  Preview
                </p>
                <div className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#10B981]/15 text-[#10B981]">
                    <Bell className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex items-center gap-1.5 truncate text-sm font-bold text-[var(--text-primary)]">
                      {priority && (
                        <Bell className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      <span className="truncate">
                        {title.trim() || "Your announcement title"}
                      </span>
                    </p>
                    <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {message.trim() || "Your announcement message will appear here."}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <footer className="border-t border-[var(--border-color)] px-5 py-3">
              <motion.button
                type="button"
                onClick={handleSubmit}
                whileTap={{ scale: 0.98 }}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send to {audienceCount} {audienceCount === 1 ? "User" : "Users"}
              </motion.button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
