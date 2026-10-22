"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { format } from "date-fns";
import { Check, X as XIcon, AlertTriangle, CheckCircle } from "lucide-react";
import { getSession, getAdminAttendanceReport } from "@/_lib/api/sessions";
import { formatDuration, youtubeEmbedUrl } from "@/_lib/utils/sessions";
import SessionStatusBadge from "@/_components/sessions/SessionStatusBadge";

function pctColor(p) {
  if (p >= 80) return "#10B981";
  if (p >= 50) return "#F59E0B";
  return "#EF4444";
}

export default function AdminSessionDetailPage() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getSession(sessionId), getAdminAttendanceReport()])
      .then(([s, report]) => {
        setSession(s);
        setAttendance(report.find((r) => r.session_id === sessionId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin/sessions"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[#10B981] font-mono-ui"
      >
        ← Back to Sessions Overview
      </Link>

      {loading ? (
        <div className="skeleton-shimmer h-96 w-full rounded-2xl" />
      ) : !session ? (
        <NotFound />
      ) : (
        <Detail session={session} attendance={attendance} />
      )}
    </div>
  );
}

function Detail({ session, attendance }) {
  const { status } = session;
  const date = new Date(session.scheduled_at);
  const attendedPct = session.enrolled_count
    ? Math.round(((session.attended_count ?? 0) / session.enrolled_count) * 100)
    : 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-3">
        <SessionStatusBadge status={status} size="lg" />
        <h1 className={`text-2xl font-bold text-[var(--text-primary)] sm:text-3xl ${status === "cancelled" ? "line-through opacity-70" : ""}`}>
          {session.title}
        </h1>
        <div className="h-px w-full bg-[var(--border-color)]" />
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <Row label="Course" value={session.course_name} />
        <Row label="Instructor" value={session.instructor_name} />
        <Row label="Date" value={`${format(date, "EEE, MMM d")} · ${format(date, "h:mm a")}`} />
        <Row label="Duration" value={formatDuration(session.duration_minutes)} />
        <Row label="Enrolled" value={`${session.enrolled_count} students`} />
        <Row
          label="Attended"
          value={
            status === "completed"
              ? `${session.attended_count} students (${attendedPct}%)`
              : status === "live"
              ? `${session.attended_count} joined`
              : "—"
          }
        />
        <Row label="Recording" value={<RecordingStatus session={session} />} />
      </dl>

      {/* Attendance */}
      {status === "completed" && attendance && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Attendance</SectionTitle>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {attendance.attended_count} of {attendance.enrolled_count} students{" "}
            <span style={{ color: pctColor(attendance.attendance_pct) }}>({attendance.attendance_pct}%)</span>
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                <tr>
                  <th className="px-3 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {attendance.students.map((stu) => {
                  const absent = stu.status === "absent";
                  return (
                    <tr key={stu.id} className="border-b border-[var(--border-color)] last:border-0">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-[var(--text-primary)]">
                          {absent ? (
                            <XIcon className="h-3.5 w-3.5 text-[#EF4444]" strokeWidth={2.5} />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-[#10B981]" strokeWidth={2.5} />
                          )}
                          {stu.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)] font-mono-ui">
                        {absent ? "—" : `${stu.duration_minutes} min`}
                      </td>
                      <td className="px-3 py-2 font-mono-ui font-bold" style={{ color: pctColor(stu.attendance_pct) }}>
                        {stu.attendance_pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Link
            href="/admin/sessions/attendance"
            className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
          >
            View Full Attendance →
          </Link>
        </section>
      )}

      {/* Recording */}
      {status === "completed" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Recording</SectionTitle>
          <RecordingBlock session={session} />
        </section>
      )}
    </motion.article>
  );
}

function RecordingStatus({ session }) {
  if (session.status !== "completed") {
    return <span className="text-[var(--text-muted)]">—</span>;
  }
  return session.recording_url ? (
    <span className="inline-flex items-center gap-1 text-[#10B981]">
      <CheckCircle className="h-4 w-4" /> Uploaded
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-500">
      <AlertTriangle className="h-4 w-4" /> Missing
    </span>
  );
}

function RecordingBlock({ session }) {
  const embed = youtubeEmbedUrl(session.recording_url);
  if (!session.recording_url) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-center">
        <p className="text-sm font-medium text-amber-600">
          Recording not uploaded for this session.
        </p>
      </div>
    );
  }
  if (embed) {
    return (
      <div className="video-responsive">
        <iframe
          src={embed}
          title={`Recording — ${session.title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <a
      href={session.recording_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
    >
      Watch Recording
    </a>
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

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">{children}</h2>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Session not found</p>
      <Link href="/admin/sessions" className="mt-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669]">
        Back to Sessions Overview
      </Link>
    </div>
  );
}
