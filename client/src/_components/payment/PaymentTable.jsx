"use client";

import { motion } from "motion/react";
import { format } from "date-fns";
import {
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  XCircle,
} from "lucide-react";
import {
  formatNaira,
  formatPaymentStatus,
  formatPaymentType,
} from "@/_lib/utils/formatters";

// Shared payments listing. Renders a table on >= md and stacked cards on
// mobile. `showParent` is on for admin views; off for parent's own history.
// `compact` shrinks the row padding/type so it can live inside dashboard
// widgets without dominating.
export default function PaymentTable({
  payments = [],
  showParent = false,
  loading = false,
  compact = false,
  onViewReceipt,
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!payments.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
        <FileText className="h-9 w-9 text-[var(--text-muted)]" strokeWidth={1.6} />
        <p className="text-sm text-[var(--text-secondary)]">
          No payment records found
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="hidden md:block">
        <DesktopTable
          payments={payments}
          showParent={showParent}
          compact={compact}
          onViewReceipt={onViewReceipt}
        />
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border-color)] md:hidden">
        {payments.map((p, i) => (
          <MobileCard
            key={p.id}
            payment={p}
            index={i}
            showParent={showParent}
            onViewReceipt={onViewReceipt}
          />
        ))}
      </ul>
    </div>
  );
}

function DesktopTable({ payments, showParent, compact, onViewReceipt }) {
  const padY = compact ? "py-2" : "py-3";
  const textCls = compact ? "text-xs" : "text-sm";

  return (
    <div className="overflow-x-auto">
      <table className={`w-full min-w-[720px] ${textCls}`}>
        <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
          <tr>
            <Th>Date</Th>
            {showParent && <Th>Parent</Th>}
            <Th>Student</Th>
            <Th>Course</Th>
            <Th>Amount</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th align="right">Receipt</Th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <motion.tr
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className="border-b border-[var(--border-color)] transition-colors last:border-b-0 odd:bg-transparent even:bg-[var(--bg-secondary)]/30 hover:bg-[var(--bg-secondary)]/60"
            >
              <td className={`px-4 ${padY} text-[var(--text-primary)] font-mono-ui`}>
                {format(new Date(p.created_at), "MMM d, yyyy")}
              </td>
              {showParent && (
                <td className={`px-4 ${padY} text-[var(--text-primary)]`}>
                  {p.parent_name ?? "—"}
                </td>
              )}
              <td className={`px-4 ${padY} text-[var(--text-primary)]`}>
                {p.student_name ?? "—"}
              </td>
              <td className={`px-4 ${padY} text-[var(--text-primary)]`}>
                {p.course_title}
              </td>
              <td className={`px-4 ${padY} font-bold text-[#10B981] font-mono-ui`}>
                {formatNaira(p.amount)}
              </td>
              <td className={`px-4 ${padY}`}>
                <TypeBadge type={p.type} />
              </td>
              <td className={`px-4 ${padY}`}>
                <StatusBadge status={p.status} />
              </td>
              <td className={`px-4 ${padY} text-right`}>
                {p.status === "paid" && !compact ? (
                  <button
                    type="button"
                    onClick={() => onViewReceipt?.(p)}
                    aria-label="View receipt"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Receipt
                  </button>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCard({ payment, index, showParent, onViewReceipt }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="flex flex-col gap-2 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-[#10B981] font-mono-ui">
            {formatNaira(payment.amount)}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {payment.course_title}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {payment.student_name}
            {showParent && payment.parent_name ? ` · ${payment.parent_name}` : ""}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
            {format(new Date(payment.created_at), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={payment.status} />
          <TypeBadge type={payment.type} />
        </div>
      </div>
      {payment.status === "paid" && (
        <button
          type="button"
          onClick={() => onViewReceipt?.(payment)}
          className="self-start inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
        >
          <FileText className="h-3.5 w-3.5" />
          Receipt
        </button>
      )}
    </motion.li>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-[10px] font-bold uppercase tracking-wider font-mono-ui`}
    >
      {children}
    </th>
  );
}

function TypeBadge({ type }) {
  const styles =
    type === "subscription"
      ? { color: "#10B981", bg: "rgba(16,185,129,0.12)" }
      : { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" };
  const label = type === "subscription" ? "Sub" : "One-time";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: styles.color, backgroundColor: styles.bg }}
      title={formatPaymentType(type)}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const Icon =
    status === "paid"
      ? CheckCircle
      : status === "pending"
      ? Clock
      : status === "failed"
      ? XCircle
      : CreditCard;
  const styles =
    status === "paid"
      ? { color: "#10B981", bg: "rgba(16,185,129,0.12)" }
      : status === "pending"
      ? { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" }
      : status === "failed"
      ? { color: "#EF4444", bg: "rgba(239,68,68,0.12)" }
      : { color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
      style={{ color: styles.color, backgroundColor: styles.bg }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {formatPaymentStatus(status)}
    </span>
  );
}
