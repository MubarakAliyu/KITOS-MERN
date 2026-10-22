"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Search, Film } from "lucide-react";
import { getCompletedSessions } from "@/_lib/api/sessions";
import { formatDuration } from "@/_lib/utils/sessions";

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    getCompletedSessions()
      // Only completed sessions that actually have a recording.
      .then((list) => setRecordings((list ?? []).filter((s) => s.recording_url)))
      .catch(() => setRecordings([]))
      .finally(() => setLoading(false));
  }, [pathname]);

  // Courses that have at least one recording — powers the filter dropdown.
  const courseOptions = useMemo(
    () => [...new Set(recordings.map((r) => r.course))],
    [recordings]
  );

  // Apply search + course filter, then group by course.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = recordings.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q);
      const matchesCourse = course === "all" || r.course === course;
      return matchesQuery && matchesCourse;
    });
    const map = new Map();
    for (const r of filtered) {
      if (!map.has(r.course)) map.set(r.course, []);
      map.get(r.course).push(r);
    }
    return [...map.entries()];
  }, [recordings, query, course]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Session Recordings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Watch recordings of past live sessions
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recordings…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="course-filter" className="text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
            Course:
          </label>
          <select
            id="course-filter"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          >
            <option value="all">All Courses</option>
            {courseOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <RecordingsSkeleton />
      ) : grouped.length === 0 ? (
        <EmptyState hasAny={recordings.length > 0} />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([courseName, items]) => (
            <section key={courseName} className="flex flex-col gap-3">
              <h2 className="border-b border-[var(--border-color)] pb-2 text-base font-semibold text-[var(--text-primary)]">
                {courseName}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((r, i) => (
                  <RecordingCard key={r.id} recording={r} index={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingCard({ recording, index }) {
  const router = useRouter();
  const date = new Date(recording.scheduled_at);
  const goToDetail = () => router.push(`/student/sessions/${recording.id}`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      whileHover={{ y: -3 }}
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
    >
      <div className="recording-thumb">
        <span className="play-icon" aria-hidden="true" />
        {recording.session_number != null && (
          <span className="absolute left-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
            Week {recording.session_number}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-1 pb-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{recording.title}</h3>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">
          {formatDistanceToNow(date, { addSuffix: true })} · {formatDuration(recording.duration_minutes)}
        </p>
      </div>
    </motion.article>
  );
}

function RecordingsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3"
        >
          <div className="skeleton-shimmer aspect-video w-full rounded-xl" />
          <div className="skeleton-shimmer h-4 w-2/3 rounded" />
          <div className="skeleton-shimmer h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasAny }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Film className="h-7 w-7" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {hasAny ? "No recordings match your search" : "No recordings yet"}
      </p>
      <p className="max-w-xs text-xs text-[var(--text-secondary)]">
        {hasAny
          ? "Try a different search term or course filter."
          : "Recordings of completed live sessions will appear here."}
      </p>
    </div>
  );
}
