"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Award,
  Download,
  Eye,
  Loader2,
  Lock,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { getCertificates } from "@/_lib/api/certificates";
import {
  downloadCertificate,
} from "@/_components/certificates/CertificateDocument";
import CertificateViewer from "@/_components/certificates/CertificateViewer";

export default function CertificatesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    getCertificates()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [pathname]);

  const opened = useMemo(
    () => items.find((c) => c.id === openId) ?? null,
    [items, openId]
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Certificates</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)] sm:text-base">
          Complete all modules, quizzes and assignments to earn your certificate
        </p>
      </header>

      {loading ? (
        <CertificatesSkeleton />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((cert, i) =>
            cert.is_unlocked ? (
              <UnlockedCard
                key={cert.id}
                cert={cert}
                index={i}
                onView={() => setOpenId(cert.id)}
              />
            ) : (
              <LockedCard key={cert.id} cert={cert} index={i} />
            )
          )}
        </div>
      )}

      <AnimatePresence>
        {opened && <CertificateViewer cert={opened} onClose={() => setOpenId(null)} />}
      </AnimatePresence>
    </div>
  );
}

function UnlockedCard({ cert, index, onView }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadCertificate(cert);
      toast.success("Certificate downloaded");
    } catch {
      toast.error("Couldn't generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-[#10B981]/40 bg-[var(--bg-card)] p-6 shadow-[0_0_0_4px_rgba(16,185,129,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(16,185,129,0.20)]"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#10B981]/15 text-[#10B981]">
        <Trophy className="h-7 w-7" strokeWidth={2.2} />
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
        Certificate Earned
      </p>
      <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{cert.course_title}</h2>
      <dl className="mt-3 flex flex-col gap-1 text-xs font-mono-ui">
        <div className="flex justify-between text-[var(--text-secondary)]">
          <dt>Completed</dt>
          <dd className="text-[var(--text-primary)]">{cert.completion_date}</dd>
        </div>
        {cert.score_average != null && (
          <div className="flex justify-between text-[var(--text-secondary)]">
            <dt>Score average</dt>
            <dd className="text-[var(--text-primary)]">{cert.score_average}%</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          <Eye className="h-4 w-4" />
          View Certificate
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#10B981] px-4 py-2 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download PDF
        </button>
      </div>
    </motion.article>
  );
}

function LockedCard({ cert, index }) {
  const m = cert.modules_progress ?? { completed: 0, total: 1 };
  const q = cert.quizzes_progress ?? { completed: 0, total: 1 };
  const a = cert.assignments_progress ?? { completed: 0, total: 1 };

  const overall = Math.round(
    ((m.completed + q.completed + a.completed) /
      Math.max(1, m.total + q.total + a.total)) *
      100
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      className="flex flex-col rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-6"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Lock className="h-7 w-7" strokeWidth={2.2} />
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        Certificate Locked
      </p>
      <h2 className="mt-1 text-lg font-bold text-[var(--text-secondary)]">
        {cert.course_title}
      </h2>

      <div className="mt-4">
        <p className="text-3xl font-bold text-[#10B981]">{overall}%</p>
        <p className="text-xs text-[var(--text-muted)] font-mono-ui">overall completion</p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <ProgressLine label="Modules" {...m} />
        <ProgressLine label="Quizzes" {...q} />
        <ProgressLine label="Assignments" {...a} />
      </div>

      <p className="mt-5 text-xs text-[var(--text-muted)] font-mono-ui">
        Complete all requirements to unlock
      </p>
    </motion.article>
  );
}

function ProgressLine({ label, completed, total }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono-ui">
        <span>{label}</span>
        <span>
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full bg-[#10B981]"
        />
      </div>
    </div>
  );
}

function CertificatesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-72 rounded-2xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Award className="h-7 w-7" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        Enrol in a course to start earning certificates.
      </p>
    </div>
  );
}
