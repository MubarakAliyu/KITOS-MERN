"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  CreditCard,
  Loader2,
  Receipt as ReceiptIcon,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getChildren } from "@/_lib/api/parents";
import { getCourses } from "@/_lib/api/courses";
import { initiatePayment, verifyPayment } from "@/_lib/api/payments";
import { notifyAdmin } from "@/_lib/notifications/adminNotify";
import { useLiveNotify } from "@/_lib/notifications/liveNotify";
import { formatNaira } from "@/_lib/utils/formatters";
import { useLanguage } from "@/_lib/i18n/LanguageContext";
import CourseThumbnail from "@/_components/ui/CourseThumbnail";
import ReceiptModal from "@/_components/payment/ReceiptModal";

// Steps in the order they appear. Used by AnimatePresence + the indicator.
const STEPS = ["select", "confirm", "processing", "success"];

// Processing stage timing — labels resolved through t() at render time so a
// mid-flow language switch still reads correctly.
const PROCESSING_STAGE_KEYS = [
  { at: 0, key: "payments.connectingPaystack" },
  { at: 1000, key: "payments.verifyingPayment" },
  { at: 2000, key: "payments.confirmingEnrollment" },
];

export default function PaystackModal({
  isOpen,
  onClose,
  defaultCourseId,
  defaultStudentId,
}) {
  const { data: session } = useSession();
  const { notify } = useLiveNotify();
  const { t } = useLanguage();

  const [step, setStep] = useState("select");
  const [children, setChildren] = useState([]);
  const [courses, setCourses] = useState([]);
  const [childId, setChildId] = useState(defaultStudentId ?? "");
  const [courseId, setCourseId] = useState(defaultCourseId ?? "");
  const [paymentType, setPaymentType] = useState("subscription");
  const [reference, setReference] = useState("");
  const [createdPayment, setCreatedPayment] = useState(null);
  const [stageKey, setStageKey] = useState(PROCESSING_STAGE_KEYS[0].key);
  const [showReceipt, setShowReceipt] = useState(false);

  // Boot — load roster + catalog once whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setStep("select");
    setChildId(defaultStudentId ?? "");
    setCourseId(defaultCourseId ?? "");
    setPaymentType("subscription");
    setReference("");
    setCreatedPayment(null);
    setShowReceipt(false);
    Promise.all([
      getChildren().catch(() => []),
      getCourses().catch(() => []),
    ]).then(([kids, list]) => {
      setChildren(kids ?? []);
      setCourses(list ?? []);
    });
  }, [isOpen, defaultCourseId, defaultStudentId]);

  // Esc closes — but only when the user isn't mid-processing.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape" && step !== "processing") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, step, onClose]);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === childId) ?? null,
    [children, childId]
  );
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId]
  );

  // If course only supports one billing model, lock the radio to it.
  useEffect(() => {
    if (selectedCourse?.payment_type) {
      setPaymentType(selectedCourse.payment_type);
    }
  }, [selectedCourse]);

  async function handlePay() {
    if (!selectedChild || !selectedCourse) return;
    setStep("processing");
    try {
      // Stage 1 — initiate.
      const init = await initiatePayment({
        student_id: selectedChild.id,
        course_id: selectedCourse.id,
        amount: selectedCourse.price,
        type: paymentType,
      });

      // Walk the processing labels while the (mock) Paystack popup would be
      // open. In prod we'd launch PaystackPop here and verify on callback.
      for (const stage of PROCESSING_STAGE_KEYS) {
        await new Promise((resolve) =>
          setTimeout(resolve, stage.at === 0 ? 0 : 800)
        );
        setStageKey(stage.key);
      }

      // Stage 2 — verify.
      const verified = await verifyPayment({
        reference: init.reference,
        course_id: selectedCourse.id,
        course_title: selectedCourse.title,
        student_id: selectedChild.id,
        student_name: selectedChild.name,
        parent_id: selectedChild.parent_id,
        parent_name: session?.user?.name ?? "Mrs. Fatima Hassan",
        amount: selectedCourse.price,
        type: paymentType,
      });

      setReference(verified.reference);
      setCreatedPayment(verified.payment ?? null);

      toast.success(t("payments.paymentConfirmed"));
      notifyAdmin("payment_made", {
        parent_name: session?.user?.name ?? "Parent",
        amount: selectedCourse.price,
        course_title: selectedCourse.title,
      });
      notify("payment_received", {
        amount: selectedCourse.price,
        parent: session?.user?.name ?? "Parent",
      });
      setStep("success");
    } catch {
      toast.error(t("notifications.paymentFailed"));
      setStep("confirm");
    }
  }

  function resetForAnother() {
    setStep("select");
    setChildId("");
    setCourseId(defaultCourseId ?? "");
    setReference("");
    setCreatedPayment(null);
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={step === "processing" ? undefined : onClose}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-0 backdrop-blur-sm sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Enroll a child"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
            >
              <Header step={step} onClose={onClose} />

              <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5">
                <AnimatePresence mode="wait">
                  {step === "select" && (
                    <StepShell key="select">
                      <SelectStep
                        t={t}
                        children={children}
                        courses={courses}
                        childId={childId}
                        setChildId={setChildId}
                        courseId={courseId}
                        setCourseId={setCourseId}
                        paymentType={paymentType}
                        setPaymentType={setPaymentType}
                        selectedCourse={selectedCourse}
                        onContinue={() => {
                          if (!selectedChild || !selectedCourse) {
                            toast.error(
                              `${t("payments.selectChild")} · ${t(
                                "payments.selectCourse"
                              )}`
                            );
                            return;
                          }
                          setStep("confirm");
                        }}
                      />
                    </StepShell>
                  )}

                  {step === "confirm" && (
                    <StepShell key="confirm">
                      <ConfirmStep
                        t={t}
                        child={selectedChild}
                        course={selectedCourse}
                        paymentType={paymentType}
                        onBack={() => setStep("select")}
                        onPay={handlePay}
                      />
                    </StepShell>
                  )}

                  {step === "processing" && (
                    <StepShell key="processing">
                      <ProcessingStep t={t} stageLabel={t(stageKey)} />
                    </StepShell>
                  )}

                  {step === "success" && (
                    <StepShell key="success">
                      <SuccessStep
                        t={t}
                        child={selectedChild}
                        course={selectedCourse}
                        reference={reference}
                        onViewReceipt={() => setShowReceipt(true)}
                        onAnother={resetForAnother}
                        onDone={onClose}
                      />
                    </StepShell>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReceiptModal
        payment={createdPayment}
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
      />
    </>
  );
}

function Header({ step, onClose }) {
  const { t } = useLanguage();
  const titles = {
    select: { title: t("payments.enrollChild"), indicator: "1 of 4" },
    confirm: { title: t("payments.confirmPayment"), indicator: "2 of 4" },
    processing: {
      title: t("payments.processingPayment"),
      indicator: "3 of 4",
    },
    success: { title: t("payments.paymentSuccessful"), indicator: "4 of 4" },
  };
  const meta = titles[step] ?? titles.select;
  const canClose = step !== "processing";

  return (
    <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {meta.title}
        </h2>
        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
          {meta.indicator}
        </p>
      </div>
      {canClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </header>
  );
}

function StepShell({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-5"
    >
      {children}
    </motion.div>
  );
}

// ── Step 1: Select child + course ─────────────────────────────────────────

function SelectStep({
  t,
  children,
  courses,
  childId,
  setChildId,
  courseId,
  setCourseId,
  paymentType,
  setPaymentType,
  selectedCourse,
  onContinue,
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section title={t("payments.selectChild")}>
        {children.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-color)] p-4 text-sm text-[var(--text-secondary)]">
            No children registered yet.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {children.map((c) => {
              const active = childId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChildId(c.id)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                    active
                      ? "border-[#10B981] bg-[#10B981]/10"
                      : "border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#10B981] text-sm font-bold text-white">
                    {c.avatar_initial ?? c.name?.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                      {c.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                      {c.admission_no ?? "—"} · {c.programme_track ?? ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("payments.selectCourse")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => {
            const active = courseId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourseId(c.id)}
                className={`relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-colors ${
                  active
                    ? "border-[#10B981]"
                    : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                }`}
              >
                <CourseThumbnail course={c} size="sm" />
                {active && (
                  <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[#10B981] text-white shadow">
                    <CheckCircle className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                )}
                <div className="flex flex-col gap-1 p-3">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {c.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {c.instructor_name ?? ""}
                  </p>
                  <p className="text-base font-bold text-[#10B981] font-mono-ui">
                    {formatNaira(c.price)}
                  </p>
                  <span
                    className="self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono-ui"
                    style={{
                      color: c.payment_type === "subscription" ? "#10B981" : "#3B82F6",
                      backgroundColor:
                        c.payment_type === "subscription"
                          ? "rgba(16,185,129,0.12)"
                          : "rgba(59,130,246,0.12)",
                    }}
                  >
                    {c.payment_type === "subscription" ? "Subscription" : "One-time"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {selectedCourse && (
        <Section title={t("payments.paymentType")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {["subscription", "one_time"].map((opt) => {
              const active = paymentType === opt;
              const locked =
                selectedCourse.payment_type &&
                selectedCourse.payment_type !== opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => !locked && setPaymentType(opt)}
                  disabled={!!locked}
                  className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                    active
                      ? "border-[#10B981] bg-[#10B981]/10"
                      : locked
                      ? "border-[var(--border-color)] opacity-40"
                      : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {opt === "subscription"
                      ? t("payments.monthlySubscription")
                      : t("payments.oneTimePayment")}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          {t("payments.total")}
        </p>
        <p className="mt-1 text-2xl font-bold text-[#10B981] font-mono-ui">
          {selectedCourse ? formatNaira(selectedCourse.price) : "—"}
          {paymentType === "subscription" && selectedCourse && (
            <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">
              {t("payments.perMonth")}
            </span>
          )}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onContinue}
        whileTap={{ scale: 0.97 }}
        disabled={!childId || !courseId}
        className="w-full rounded-xl bg-[#10B981] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t("payments.continue")}
      </motion.button>
    </div>
  );
}

// ── Step 2: Confirm ───────────────────────────────────────────────────────

function ConfirmStep({ t, child, course, paymentType, onBack, onPay }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">
        <Row
          label={t("payments.student")}
          value={`${child?.name} · ${child?.admission_no ?? ""}`}
        />
        <Row label={t("payments.course")} value={course?.title} />
        <Row
          label={t("payments.paymentType")}
          value={
            paymentType === "subscription"
              ? t("payments.monthlySubscription")
              : t("payments.oneTimePayment")
          }
        />
        <div className="border-t border-[var(--border-color)] pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
            {t("payments.amountPaid")}
          </p>
          <p className="mt-1 text-3xl font-bold text-[#10B981] font-mono-ui">
            {formatNaira(course?.price)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-ui text-sm font-bold tracking-wider text-[#0BA5EC]">
            Paystack
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] font-mono-ui">
            <Shield className="h-3 w-3" />
            {t("payments.securedByPaystack")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Method icon={CreditCard} label="Card Payment" />
          <Method icon={Building2} label="Bank Transfer" />
          <Method icon={Smartphone} label="USSD / Mobile" />
        </div>
      </div>

      <motion.button
        type="button"
        onClick={onPay}
        whileTap={{ scale: 0.97 }}
        className="w-full rounded-xl bg-[#10B981] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#059669] active:scale-95"
      >
        {t("payments.payNow")} {formatNaira(course?.price)}
      </motion.button>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 self-center text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] font-mono-ui"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("common.back")}
      </button>
    </div>
  );
}

// ── Step 3: Processing ────────────────────────────────────────────────────

function ProcessingStep({ stageLabel }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <Loader2
        className="h-20 w-20 animate-spin text-[#10B981]"
        strokeWidth={1.6}
      />
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {stageLabel}
      </p>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 2.5, ease: "linear" }}
          className="h-full bg-[#10B981]"
        />
      </div>
    </div>
  );
}

// ── Step 4: Success ───────────────────────────────────────────────────────

function SuccessStep({
  t,
  child,
  course,
  reference,
  onViewReceipt,
  onAnother,
  onDone,
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="grid h-20 w-20 place-items-center rounded-full bg-[#10B981]/15 text-[#10B981]"
      >
        <CheckCircle className="h-12 w-12" strokeWidth={2.4} />
      </motion.span>
      <h3 className="text-xl font-bold text-[var(--text-primary)]">
        {t("payments.paymentConfirmed")}
      </h3>

      <div className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-left">
        <Row label={t("payments.course")} value={course?.title} />
        <Row label={t("payments.student")} value={child?.name} />
        <Row label={t("payments.amountPaid")} value={formatNaira(course?.price)} />
        <Row label={t("payments.reference")} value={reference} mono />
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onViewReceipt}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#10B981] px-4 py-2.5 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 active:scale-95"
        >
          <ReceiptIcon className="h-4 w-4" />
          {t("payments.viewReceipt")}
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] active:scale-95"
        >
          {t("payments.enrollAnother")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] active:scale-95"
        >
          {t("payments.done")}
        </button>
      </div>
    </div>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-[var(--text-primary)] ${
          mono ? "font-mono-ui" : ""
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function Method({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
