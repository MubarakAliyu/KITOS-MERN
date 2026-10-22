"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelSubscription } from "@/_lib/api/payments";
import { notifyAdmin } from "@/_lib/notifications/adminNotify";
import { formatNaira } from "@/_lib/utils/formatters";
import { useLanguage } from "@/_lib/i18n/LanguageContext";

export default function SubscriptionCard({ plan, onCancelled }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  const isActive = plan.status === "active";

  async function handleCancel() {
    setSubmitting(true);
    try {
      await cancelSubscription(plan.id);
      onCancelled?.({ ...plan, status: "cancelled" });
      toast.success(t("payments.subscriptionCancelled"));
      notifyAdmin("subscription_cancelled", {
        student_name: plan.student_name,
        course_title: plan.course_title,
      });
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
            {plan.course_title}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            {plan.student_name}
          </p>
        </div>
        <StatusPill active={isActive} />
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={t("payments.total")}
          value={`${formatNaira(plan.amount)} / ${t("payments.perMonth")}`}
        />
        <Stat
          label="Started"
          value={format(new Date(plan.start_date), "MMM d, yyyy")}
        />
        <Stat
          label="Next billing"
          value={
            isActive
              ? format(new Date(plan.next_billing), "MMM d, yyyy")
              : "—"
          }
        />
      </dl>

      {isActive && !showConfirm && (
        <footer className="mt-4">
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 active:scale-95"
          >
            {t("payments.cancelSubscription")}
          </button>
        </footer>
      )}

      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="inline-flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t("payments.confirmCancel")}
              </p>
              <p className="text-xs text-red-700/90 dark:text-red-300/80">
                {t("payments.cancelWarning")} —{" "}
                <span className="font-semibold">{plan.course_title}</span> ·{" "}
                <span className="font-semibold">{plan.student_name}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] active:scale-95 disabled:opacity-60"
                >
                  {t("payments.keepSubscription")}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 active:scale-95 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t("payments.cancelSubscription")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function StatusPill({ active }) {
  const { t } = useLanguage();
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={
        active
          ? { color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)" }
          : { color: "#EF4444", backgroundColor: "rgba(239,68,68,0.12)" }
      }
    >
      {active ? t("users.active") : t("payments.subscriptionCancelled")}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--text-primary)] font-mono-ui">
        {value}
      </dd>
    </div>
  );
}
