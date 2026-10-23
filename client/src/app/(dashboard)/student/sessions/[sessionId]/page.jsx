"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Play,
  Clock,
  Timer,
  Radio,
} from "lucide-react";
import { getSession } from "@/_lib/api/sessions";
import { useCountdown } from "@/_hooks/useCountdown";
import {
  statusMeta,
  formatDuration,
  minutesSince,
  minutesRemaining,
  youtubeEmbedUrl,
  googleCalendarUrl,
} from "@/_lib/utils/sessions";
import SessionStatusBadge from "@/_components/sessions/SessionStatusBadge";

// Total sessions in a course track — mock constant for the "Week X of N" line
// until the backend exposes it per-course.
const TRACK_LENGTH = 12;

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSession(sessionId)
      .then((s) => setSession(s))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/student/sessions"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[#10B981] font-mono-ui"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Online Classes
      </Link>

      {loading ? (
        <DetailSkeleton />
      ) : !session ? (
        <NotFound />
      ) : (
        <SessionDetail session={session} />
      )}
    </div>
  );
}

function SessionDetail({ session }) {
  const { status } = session;
  const date = new Date(session.scheduled_at);
  const cancelled = status === "cancelled";
  const meta = statusMeta(status);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-3">
        <SessionStatusBadge status={status} size="lg" />
        <h1
          className={`text-2xl font-bold text-[var(--text-primary)] sm:text-3xl ${
            cancelled ? "line-through opacity-70" : ""
          }`}
        >
          {session.title}
        </h1>
        <div className="h-px w-full bg-[var(--border-color)]" />
      </div>

      {/* Info grid */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <InfoRow label="Course" value={session.course} />
        <InfoRow label="Instructor" value={session.instructor_name} />
        <InfoRow label="Date" value={`${format(date, "EEEE, MMM d")} · ${format(date, "h:mm a")}`} />
        <InfoRow label="Duration" value={formatDuration(session.duration_minutes)} />
        {session.session_number != null && (
          <InfoRow label="Session" value={`Week ${session.session_number} of ${TRACK_LENGTH}`} />
        )}
        <InfoRow
          label="Status"
          value={
            <span className="inline-flex items-center gap-1.5" style={{ color: meta.color }}>
              {status === "live" && <span className="live-dot" aria-hidden="true" />}
              {status === "live"
                ? "Currently Live"
                : status === "scheduled"
                ? "Upcoming"
                : status === "completed"
                ? "Completed"
                : "Cancelled"}
            </span>
          }
        />
      </dl>

      {/* Status-specific primary block */}
      <StatusBlock session={session} />

      {/* Description */}
      {session.description && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Description</SectionTitle>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {session.description}
          </p>
        </section>
      )}

      {/* Session Information stat cards (live/completed) */}
      {(status === "live" || status === "completed") && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Session Information</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Clock}
              label="Duration"
              value={formatDuration(session.duration_minutes)}
            />
            {status === "live" ? (
              <StatCard
                icon={Timer}
                label="Remaining"
                value={`${minutesRemaining(session.scheduled_at, session.duration_minutes)} min`}
                accent="#DC2626"
              />
            ) : (
              <StatCard icon={Radio} label="Held" value={format(date, "MMM d, yyyy")} />
            )}
          </div>
        </section>
      )}

      {/* Recording (completed only) */}
      {status === "completed" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Recording</SectionTitle>
          <RecordingBlock session={session} />
        </section>
      )}
    </motion.article>
  );
}

function StatusBlock({ session }) {
  const { status } = session;
  const { label } = useCountdown(session.scheduled_at);

  if (status === "live") {
    const started = minutesSince(session.scheduled_at);
    const remaining = minutesRemaining(session.scheduled_at, session.duration_minutes);
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center"
        style={{
          borderColor: "rgba(16,185,129,0.35)",
          background: "linear-gradient(135deg, rgba(16,185,129,0.12), transparent)",
        }}
      >
        <a
          href={session.join_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => toast.success("Joining session…", { description: session.title })}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-8 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#059669]"
        >
          Join Session Now <ArrowRight className="h-5 w-5" />
        </a>
        <p className="text-xs text-[var(--text-secondary)]">
          Click to join in a new tab. Your attendance will be recorded.
        </p>
        <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
          Started {started} min ago · {remaining} min remaining
        </p>
      </div>
    );
  }

  if (status === "scheduled") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Starts in
        </p>
        <p className="text-2xl font-bold text-[#10B981] font-mono-ui sm:text-3xl">
          {label ?? "—"}
        </p>
        <a
          href={googleCalendarUrl(session)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
        >
          <CalendarPlus className="h-4 w-4" /> Add to Calendar
        </a>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-5 text-center">
        <p className="text-sm font-semibold text-[#EF4444]">
          This session was cancelled by the instructor.
        </p>
      </div>
    );
  }

  return null;
}

function RecordingBlock({ session }) {
  const embed = youtubeEmbedUrl(session.recording_url);

  if (!session.recording_url) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-color)] p-6 text-center">
        <p className="text-sm font-medium text-[var(--text-muted)]">Recording not available</p>
      </div>
    );
  }

  if (embed) {
    return (
      <div className="flex flex-col gap-3">
        <div className="video-responsive">
          <iframe
            src={embed}
            title={`Recording — ${session.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">
          {session.title} · {formatDuration(session.duration_minutes)}
        </p>
      </div>
    );
  }

  // Non-YouTube URL — styled external link.
  return (
    <a
      href={session.recording_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
    >
      Watch Recording <Play className="h-4 w-4" fill="currentColor" />
    </a>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-color)] pb-2 sm:justify-start sm:gap-3 sm:border-0 sm:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--text-primary)] text-right sm:text-left">
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
      {children}
    </h2>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono-ui">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span
        className="text-lg font-bold text-[var(--text-primary)]"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8">
      <div className="skeleton-shimmer h-5 w-24 rounded-full" />
      <div className="skeleton-shimmer h-8 w-2/3 rounded" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-4 w-full rounded" />
        ))}
      </div>
      <div className="skeleton-shimmer h-28 w-full rounded-2xl" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Session not found</p>
      <p className="text-xs text-[var(--text-secondary)]">
        It may have been removed or the link is incorrect.
      </p>
      <Link
        href="/student/sessions"
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        Back to Online Classes
      </Link>
    </div>
  );
}
