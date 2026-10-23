"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { differenceInDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Clock,
  CreditCard,
  Plus,
  TrendingUp,
} from "lucide-react";
import {
  getPayments,
  getPaymentStats,
  getSubscriptions,
} from "@/_lib/api/payments";
import { useCountUp } from "@/_hooks/useCountUp";
import { formatNaira } from "@/_lib/utils/formatters";
import PaymentTable from "@/_components/payment/PaymentTable";
import ReceiptModal from "@/_components/payment/ReceiptModal";
import PaystackModal from "@/_components/payment/PaystackModal";
import SubscriptionCard from "@/_components/payment/SubscriptionCard";

// Resolved via session context on backend.

const RANGES = [
  { key: "all", label: "All Time" },
  { key: "month", label: "This Month" },
  { key: "last", label: "Last Month" },
];

export default function ParentPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState("all");
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [showPaystack, setShowPaystack] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getPayments(),
      getPaymentStats(),
      getSubscriptions(),
    ])
      .then(([rows, s, subs]) => {
        setPayments(rows ?? []);
        setStats(s ?? null);
        setSubscriptions(subs ?? []);
      })
      .catch((err) => {
        console.warn("Payments fetch failed:", err.message);
        setError("Failed to load payments. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  const filtered = useMemo(() => {
    if (range === "all") return payments;
    const now = new Date();
    return payments.filter((p) => {
      const d = new Date(p.created_at);
      if (range === "month") {
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      }
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return (
        d.getFullYear() === lastMonth.getFullYear() &&
        d.getMonth() === lastMonth.getMonth()
      );
    });
  }, [payments, range]);

  const sortedHistory = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    [filtered]
  );

  const totalSpent = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const activeSubs = subscriptions.filter((s) => s.status === "active").length;
  const pendingCount = payments.filter((p) => p.status === "pending").length;

  const monthlyData = stats?.monthly_data ?? [];

  const breakdownData = useMemo(() => {
    const paid = payments.filter((p) => p.status === "paid");
    const sub = paid
      .filter((p) => p.type === "subscription")
      .reduce((s, p) => s + p.amount, 0);
    const ot = paid
      .filter((p) => p.type === "one_time")
      .reduce((s, p) => s + p.amount, 0);
    return [
      { name: "Subscription", value: sub, fill: "#10B981" },
      { name: "One-time", value: ot, fill: "#1E40AF" },
    ];
  }, [payments]);

  function handleSubscriptionCancelled(updated) {
    setSubscriptions((list) =>
      list.map((s) => (s.id === updated.id ? updated : s))
    );
  }

  function handleModalClose() {
    setShowPaystack(false);
    // Refetch — a payment may have completed inside the modal.
    Promise.all([
      getPayments(),
      getPaymentStats(),
    ]).then(([rows, s]) => {
      setPayments(rows ?? []);
      setStats(s ?? null);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Payments
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Subscriptions, history, and quick enrollment.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={() => setShowPaystack(true)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] sm:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Pay Now
        </motion.button>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      <StatsRow
        totalSpent={totalSpent}
        activeSubs={activeSubs}
        pendingCount={pendingCount}
        loading={loading}
      />

      <SubscriptionsSection
        subscriptions={subscriptions}
        loading={loading}
        onEnroll={() => setShowPaystack(true)}
        onCancelled={handleSubscriptionCancelled}
      />

      <ChartsRow monthlyData={monthlyData} breakdownData={breakdownData} />

      <HistorySection
        range={range}
        setRange={setRange}
        history={sortedHistory}
        loading={loading}
        onViewReceipt={setReceiptPayment}
      />

      <ReceiptModal
        payment={receiptPayment}
        isOpen={!!receiptPayment}
        onClose={() => setReceiptPayment(null)}
      />
      <PaystackModal isOpen={showPaystack} onClose={handleModalClose} />
    </motion.div>
  );
}

// ── Stats row ─────────────────────────────────────────────────────────────

function StatsRow({ totalSpent, activeSubs, pendingCount, loading }) {
  const total = useCountUp(totalSpent);
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        icon={CreditCard}
        color="#10B981"
        label="Total Spent"
        value={formatNaira(total)}
        loading={loading}
        large
        delay={0}
      />
      <StatCard
        icon={TrendingUp}
        color="#22C55E"
        label="Active Subscriptions"
        value={activeSubs}
        loading={loading}
        delay={0.08}
      />
      <StatCard
        icon={Clock}
        color="#F59E0B"
        label="Pending"
        value={pendingCount}
        loading={loading}
        delay={0.16}
      />
    </section>
  );
}

function StatCard({ icon: Icon, color, label, value, loading, large, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -2 }}
      className="flex flex-col gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 transition-shadow hover:shadow-md"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{ backgroundColor: `${color}1F`, color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      {loading ? (
        <div className="skeleton-shimmer h-7 w-24 rounded" />
      ) : (
        <p
          className={`font-bold text-[var(--text-primary)] font-mono-ui ${
            large ? "text-3xl text-[#10B981]" : "text-2xl"
          }`}
        >
          {value}
        </p>
      )}
    </motion.div>
  );
}

// ── Subscriptions ─────────────────────────────────────────────────────────

function SubscriptionsSection({ subscriptions, loading, onEnroll, onCancelled }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Active Subscriptions
        </h2>
        <button
          type="button"
          onClick={onEnroll}
          className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          Manage Enrollments
        </button>
      </header>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-40 rounded-xl" />
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No active subscriptions
          </p>
          <button
            type="button"
            onClick={onEnroll}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Enroll a Child
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subscriptions.map((plan) => (
            <SubscriptionCard
              key={plan.id}
              plan={plan}
              onCancelled={onCancelled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────

function ChartsRow({ monthlyData, breakdownData }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Monthly Spend">
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart
              data={monthlyData}
              margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                stroke="var(--border-color)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "rgba(16,185,129,0.08)" }}
                content={<MonthlyTooltip />}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="subscription"
                stackId="a"
                name="Subscription"
                fill="#10B981"
                radius={[0, 0, 0, 0]}
                animationDuration={1200}
                animationBegin={0}
              />
              <Bar
                dataKey="one_time"
                stackId="a"
                name="One-time"
                fill="#1E40AF"
                radius={[6, 6, 0, 0]}
                animationDuration={1200}
                animationBegin={200}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Spend Breakdown">
        <div className="relative" style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={breakdownData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                stroke="var(--bg-card)"
                strokeWidth={2}
                animationDuration={1200}
                animationBegin={0}
              >
                {breakdownData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip content={<CurrencyTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <PieCenterTotal data={breakdownData} label="Total" />
        </div>
        <PieLegend data={breakdownData} />
      </ChartCard>
    </section>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      {payload.map((p) => (
        <p
          key={p.dataKey}
          className="text-xs font-semibold font-mono-ui"
          style={{ color: p.color }}
        >
          {p.name}: {formatNaira(p.value)}
        </p>
      ))}
      <p className="mt-1 text-sm font-bold text-[var(--text-primary)] font-mono-ui">
        Total: {formatNaira(total)}
      </p>
    </div>
  );
}

function CurrencyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {p.name}
      </p>
      <p className="text-sm font-bold text-[#10B981] font-mono-ui">
        {formatNaira(p.value)}
      </p>
    </div>
  );
}

function PieCenterTotal({ data, label }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          {label}
        </p>
        <p className="mt-0.5 text-base font-bold text-[var(--text-primary)] font-mono-ui">
          {formatNaira(total)}
        </p>
      </div>
    </div>
  );
}

function PieLegend({ data }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {data.map((d) => (
        <li key={d.name} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: d.fill }}
          />
          <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono-ui">
            {d.name} · {formatNaira(d.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── History ───────────────────────────────────────────────────────────────

function HistorySection({ range, setRange, history, loading, onViewReceipt }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Payment History
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors font-mono-ui ${
                  active
                    ? "border-[#10B981] bg-[#10B981] text-white"
                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </header>
      <PaymentTable
        payments={history}
        loading={loading}
        showParent={false}
        onViewReceipt={onViewReceipt}
      />
    </section>
  );
}
