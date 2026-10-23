"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, CheckCircle, Search, Bell } from "lucide-react";
import { getAdminSessionsOverview } from "@/_lib/api/sessions";
import { formatDuration } from "@/_lib/utils/sessions";

export default function AdminRecordingsPage() {
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState("");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("all"); // all | has | missing
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    getAdminSessionsOverview()
      .then((o) => setCompleted((o?.sessions ?? []).filter((s) => s.status === "completed")))
      .catch(() => setCompleted([]))
      .finally(() => setLoading(false));
  }, [pathname]);

  const courseOptions = useMemo(() => [...new Set(completed.map((s) => s.course_name))], [completed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return completed.filter((s) => {
      if (course && s.course_name !== course) return false;
      if (show === "has" && !s.recording_url) return false;
      if (show === "missing" && s.recording_url) return false;
      if (q && !(s.title.toLowerCase().includes(q) || s.course_name.toLowerCase().includes(q) || s.instructor_name.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [completed, course, search, show]);

  const missing = filtered.filter((s) => !s.recording_url);
  const available = filtered.filter((s) => s.recording_url);
  const uploadedCount = completed.filter((s) => s.recording_url).length;
  const missingCount = completed.filter((s) => !s.recording_url).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/sessions"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[#10B981] font-mono-ui"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Live Sessions
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-[var(--text-primary)]">Session Recordings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Monitor recording availability across all courses
        </p>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <div className="flex items-center gap-3 rounded-2xl border border-[#10B981]/40 bg-[#10B981]/10 p-4">
              <CheckCircle className="h-6 w-6 text-[#10B981]" strokeWidth={2.2} />
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{uploadedCount}</p>
                <p className="text-xs text-[var(--text-secondary)]">Uploaded</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 rounded-2xl border p-4 ${missingCount > 0 ? "border-amber-500/40 bg-amber-500/10" : "border-[#10B981]/40 bg-[#10B981]/10"}`}>
              <AlertTriangle className={`h-6 w-6 ${missingCount > 0 ? "text-amber-500" : "text-[#10B981]"}`} strokeWidth={2.2} />
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{missingCount}</p>
                <p className="text-xs text-[var(--text-secondary)]">Missing</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={course} onChange={(e) => setCourse(e.target.value)} className={selectClass}>
                <option value="">All Courses</option>
                {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "All" },
                { key: "has", label: "Has Recording" },
                { key: "missing", label: "Missing Recording" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setShow(opt.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors font-mono-ui ${
                    show === opt.key
                      ? "bg-[#10B981] text-white"
                      : "border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Missing recordings (priority) */}
          {missing.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Missing Recordings
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {missing.map((s) => <MissingCard key={s.id} session={s} />)}
              </div>
            </section>
          )}

          {/* Available recordings */}
          <section className="flex flex-col gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
              <CheckCircle className="h-5 w-5 text-[#10B981]" /> Available Recordings
            </h2>
            {available.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-secondary)]">
                No recordings match these filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {available.map((s, i) => <RecordingCard key={s.id} session={s} index={i} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MissingCard({ session }) {
  function notify() {
    toast.success(`Notification sent to ${session.instructor_name}`);
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={2.2} />
        <h3 className="text-base font-bold text-[var(--text-primary)]">{session.title}</h3>
      </div>
      <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
        {session.course_name} · {session.instructor_name} · {formatDistanceToNow(new Date(session.scheduled_at), { addSuffix: true })}
      </p>
      <p className="text-xs text-[var(--text-muted)] font-mono-ui">Duration: {formatDuration(session.duration_minutes)}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Recording not uploaded. The instructor should add the recording.
      </p>
      <button
        type="button"
        onClick={notify}
        className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-500/20"
      >
        <Bell className="h-4 w-4" /> Notify Instructor
      </button>
    </motion.div>
  );
}

function RecordingCard({ session, index }) {
  const router = useRouter();
  const go = () => router.push(`/admin/sessions/${session.id}`);
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      whileHover={{ y: -3 }}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
    >
      <div className="recording-thumb">
        <span className="play-icon" aria-hidden="true" />
        {session.session_number != null && (
          <span className="absolute left-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
            Week {session.session_number}
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
          {session.recording_source || "YouTube"}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-1 pb-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{session.title}</h3>
        <p className="text-xs text-[var(--text-secondary)] font-mono-ui">{session.instructor_name}</p>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">
          {formatDistanceToNow(new Date(session.scheduled_at), { addSuffix: true })} · {formatDuration(session.duration_minutes)}
        </p>
      </div>
    </motion.article>
  );
}

const selectClass =
  "rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20";

function Skeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="skeleton-shimmer h-20 rounded-2xl" />
        <div className="skeleton-shimmer h-20 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
            <div className="skeleton-shimmer aspect-video w-full rounded-xl" />
            <div className="skeleton-shimmer h-4 w-2/3 rounded" />
            <div className="skeleton-shimmer h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
