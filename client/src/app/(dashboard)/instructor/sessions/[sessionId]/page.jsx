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
  Users,
  UserCheck,
  UserX,
  Check,
  Loader2,
  CalendarClock,
} from "lucide-react";
import {
  getInstructorSession,
  getAttendanceRoster,
  saveAttendance,
} from "@/_lib/api/sessions";
import { useCountdown } from "@/_hooks/useCountdown";
import { formatDuration, minutesSince, minutesRemaining } from "@/_lib/utils/sessions";
import SessionStatusBadge from "@/_components/sessions/SessionStatusBadge";

export default function InstructorSessionDetailPage() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getInstructorSession(sessionId)
      .then(setSession)
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/instructor/sessions"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[#10B981] font-mono-ui"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Manage Sessions
      </Link>

      {loading ? (
        <div className="skeleton-shimmer h-96 w-full rounded-2xl" />
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-3">
        <SessionStatusBadge status={status} size="lg" />
        <h1 className={`text-2xl font-bold text-[var(--text-primary)] sm:text-3xl ${cancelled ? "line-through opacity-70" : ""}`}>
          {session.title}
        </h1>
        <div className="h-px w-full bg-[var(--border-color)]" />
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <Row label="Course" value={session.course_name ?? session.course} />
        <Row label="Instructor" value={session.instructor_name} />
        <Row label="Date" value={`${format(date, "EEE, MMM d")} · ${format(date, "h:mm a")}`} />
        <Row label="Duration" value={formatDuration(session.duration_minutes)} />
        <Row label="Enrolled" value={`${session.enrolled_count ?? 0} students`} />
        <Row label="Session" value={session.session_number != null ? `Week ${session.session_number}` : "—"} />
      </dl>

      {/* Live: start/join + take attendance */}
      {status === "live" && <LiveBlock session={session} />}

      {/* Scheduled: countdown + attendance not yet open */}
      {status === "scheduled" && <ScheduledBlock session={session} />}

      {/* Cancelled: notice only — no attendance, no recording */}
      {status === "cancelled" && (
        <div className="rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-5 text-center">
          <p className="text-sm font-semibold text-[#EF4444]">This session was cancelled.</p>
          {session.cancellation_reason && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Reason: {session.cancellation_reason}</p>
          )}
        </div>
      )}

      {/* Attendance taker — live (check-in) or completed (edit). */}
      {(status === "live" || status === "completed") && (
        <AttendanceTaker session={session} />
      )}
    </motion.article>
  );
}

function LiveBlock({ session }) {
  const started = minutesSince(session.scheduled_at);
  const remaining = minutesRemaining(session.scheduled_at, session.duration_minutes);
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center"
      style={{ borderColor: "rgba(220,38,38,0.35)", background: "linear-gradient(135deg, rgba(220,38,38,0.1), transparent)" }}
    >
      <a
        href={session.join_url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => toast.success("Opening session…", { description: session.title })}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-8 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#059669]"
      >
        Start / Join Session <ArrowRight className="h-5 w-5" />
      </a>
      <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
        Started {started} min ago · {remaining} min remaining
      </p>
    </div>
  );
}

function ScheduledBlock({ session }) {
  const { label } = useCountdown(session.scheduled_at);
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-center">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        <CalendarClock className="h-3.5 w-3.5" /> Starts in
      </p>
      <p className="text-2xl font-bold text-[#10B981] font-mono-ui sm:text-3xl">{label ?? "—"}</p>
      <p className="text-xs text-[var(--text-secondary)]">
        Attendance opens once the session goes live.
      </p>
    </div>
  );
}

// ── Attendance taker ───────────────────────────────────────────────────────

function AttendanceTaker({ session }) {
  const [roster, setRoster] = useState(null);
  const [saving, setSaving] = useState(false);
  const live = session.status === "live";

  useEffect(() => {
    getAttendanceRoster(session.id).then((r) => setRoster(r.roster));
  }, [session.id]);

  function toggle(id) {
    setRoster((prev) => prev.map((s) => (s.id === id ? { ...s, present: !s.present } : s)));
  }
  function markAll(present) {
    setRoster((prev) => prev.map((s) => ({ ...s, present })));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveAttendance(session.id, roster);
      toast.success(`Attendance saved — ${res.attended}/${res.total} present`);
    } catch {
      toast.error("Couldn't save attendance");
    } finally {
      setSaving(false);
    }
  }

  const presentCount = roster?.filter((s) => s.present).length ?? 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
          <UserCheck className="h-4 w-4" /> {live ? "Take Attendance" : "Attendance"}
        </h2>
        {roster && (
          <span className="text-xs font-bold text-[#10B981] font-mono-ui">
            {presentCount}/{roster.length} present
          </span>
        )}
      </div>

      {live && (
        <p className="text-xs text-[var(--text-secondary)]">
          Check students in as they join the session.
        </p>
      )}

      {!roster ? (
        <div className="skeleton-shimmer h-40 w-full rounded-xl" />
      ) : (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => markAll(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
            >
              <Users className="h-3.5 w-3.5" /> Mark all present
            </button>
            <button
              type="button"
              onClick={() => markAll(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[#EF4444] hover:text-[#EF4444]"
            >
              <UserX className="h-3.5 w-3.5" /> Clear all
            </button>
          </div>

          <ul className="flex flex-col divide-y divide-[var(--border-color)] overflow-hidden rounded-xl border border-[var(--border-color)]">
            {roster.map((stu) => (
              <li key={stu.id} className="flex items-center justify-between gap-3 bg-[var(--bg-card)] px-4 py-2.5">
                <span className="text-sm text-[var(--text-primary)]">{stu.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(stu.id)}
                  aria-pressed={stu.present}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors font-mono-ui ${
                    stu.present
                      ? "bg-[#10B981] text-white"
                      : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#10B981]"
                  }`}
                >
                  {stu.present ? <Check className="h-3.5 w-3.5" /> : null}
                  {stu.present ? "Present" : "Absent"}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Attendance
          </button>
        </>
      )}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-color)] pb-2 sm:justify-start sm:gap-3 sm:border-0 sm:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--text-primary)] sm:text-left">{value}</dd>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Session not found</p>
      <Link href="/instructor/sessions" className="mt-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669]">
        Back to Manage Sessions
      </Link>
    </div>
  );
}
