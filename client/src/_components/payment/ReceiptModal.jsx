"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { Check, FileText, Printer, Receipt, X } from "lucide-react";
import { formatNaira } from "@/_lib/utils/formatters";
import { useLanguage } from "@/_lib/i18n/LanguageContext";

export default function ReceiptModal({ payment, isOpen, onClose }) {
  // Backwards-compatible: legacy callers pass `payment` alone (no isOpen).
  const open = isOpen ?? !!payment;
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && payment && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Payment receipt"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="print-receipt w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 bg-[#10B981] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
                  <Receipt className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <h2 className="text-sm font-bold uppercase tracking-wider font-mono-ui">
                  {t("payments.paymentReceipt")}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 no-print"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-col gap-4 px-5 py-5">
              <p className="text-sm font-bold text-[#10B981] font-mono-ui">
                {t("payments.receiptNumber")}: RCP-{String(payment.id).toUpperCase()}
              </p>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                <KV
                  label={t("payments.reference")}
                  value={format(new Date(payment.created_at), "MMM d, yyyy")}
                />
                <div>
                  <Label>{t("users.status")}</Label>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-[#10B981] font-mono-ui">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    {payment.status === "paid"
                      ? t("payments.paid")
                      : payment.status}
                  </p>
                </div>
              </div>

              <Block label={t("payments.billedTo")}>
                {payment.parent_name ?? "—"}
              </Block>

              <Block label={t("payments.student")}>
                {payment.student_name ?? "—"}
                {payment.student_admission_no
                  ? ` · ${payment.student_admission_no}`
                  : ""}
              </Block>

              <Block label={t("payments.course")}>
                <span className="font-bold">{payment.course_title}</span>
                <br />
                <span className="text-xs text-[var(--text-secondary)]">
                  {payment.type === "subscription"
                    ? t("payments.monthlySubscription")
                    : t("payments.oneTimePayment")}
                </span>
              </Block>

              <div className="border-t border-[var(--border-color)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <Label>{t("payments.amountPaid")}</Label>
                  <p className="text-2xl font-bold text-[#10B981] font-mono-ui">
                    {formatNaira(payment.amount)}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                {t("payments.reference")}: {payment.paystack_ref}
              </p>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] active:scale-95"
              >
                <Printer className="h-4 w-4" />
                {t("payments.printReceipt")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] active:scale-95"
              >
                <FileText className="h-4 w-4" />
                {t("common.close")}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Label({ children }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
      {children}
    </span>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)] font-mono-ui">
        {value}
      </p>
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1 text-sm text-[var(--text-primary)]">{children}</p>
    </div>
  );
}
