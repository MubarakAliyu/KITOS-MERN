"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
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
  CheckCircle,
  Clock,
  Download,
  Search,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getPayments, getPaymentStats } from "@/_lib/api/payments";
import { useCountUp } from "@/_hooks/useCountUp";
import { formatNaira } from "@/_lib/utils/formatters";
import PaymentTable from "@/_components/payment/PaymentTable";
import ReceiptModal from "@/_components/payment/ReceiptModal";

const RANGES = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

const STATUSES = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
];

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [receiptPayment, setReceiptPayment] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getPayments(), getPaymentStats()])
      .then(([rows, s]) => {
        setPayments(rows ?? []);
        setStats(s ?? null);
      })
      .catch((err) => {
        console.warn("Payments fetch failed:", err.message);
        setError("Failed to load payments. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (range !== "all") {
        const days = differenceInCalendarDays(new Date(), new Date(p.created_at));
        const limit = range === "today" ? 0 : range === "week" ? 7 : 30;
        if (days < 0 || days > limit) return false;
      }
      if (!q) return true;
      return [p.parent_name, p.student_name, p.course_title]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [payments, query, range, status]);

  const sortedHistory = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    [filtered]
  );

  const counts = useMemo(() => {
    return {
      paid: payments.filter((p) => p.status === "paid").length,
      pending: payments.filter((p) => p.status === "pending").length,
      failed: payments.filter((p) => p.status === "failed").length,
    };
  }, [payments]);

  function exportCSV() {
    if (sortedHistory.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const headers = ["Date", "Parent", "Student", "Course", "Amount", "Type", "Status", "Ref"];
    const rows = sortedHistory.map((p) => [
      format(new Date(p.created_at), "yyyy-MM-dd"),
      p.parent_name ?? "",
      p.student_name ?? "",
      p.course_title ?? "",
      p.amount,
      p.type,
      p.status,
      p.paystack_ref,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kit-payments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
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
            Payment Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Cross-platform payment history and revenue.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={exportCSV}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] sm:self-auto"
        >
          <Download className="h-4 w-4" strokeWidth={2.2} />
          Export CSV
        </motion.button>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      <RevenueStats stats={stats} loading={loading} />

      <ChartsRow stats={stats} />

      <QuickStatsRow counts={counts} />

      <Filters
        range={range}
        setRange={setRange}
        status={status}
        setStatus={setStatus}
        query={query}
        setQuery={setQuery}
      />

      <PaymentTable
        payments={sortedHistory}
        showParent
        loading={loading}
        onViewReceipt={setReceiptPayment}
      />

      <ReceiptModal
        payment={receiptPayment}
        isOpen={!!receiptPayment}
        onClose={() => setReceiptPayment(null)}
      />
    </motion.div>
  );
}

// ── Revenue stats ─────────────────────────────────────────────────────────

function RevenueStats({ stats, loading }) {
  const total = useCountUp(stats?.total_revenue ?? 0);
  const thisMonth = stats?.this_month ?? 0;
  const lastMonth = stats?.last_month ?? 0;
  const trendUp = thisMonth >= lastMonth;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Total Revenue"
        value={formatNaira(total)}
        loading={loading}
        accent
        delay={0}
      />
      <Stat
        label="This Month"
        value={formatNaira(thisMonth)}
        loading={loading}
        trendIcon={trendUp ? TrendingUp : TrendingDown}
        trendColor={trendUp ? "#10B981" : "#EF4444"}
        delay={0.08}
      />
      <Stat
        label="Subscriptions"
        value={formatNaira(stats?.subscription_revenue ?? 0)}
        loading={loading}
        delay={0.16}
      />
      <Stat
        label="One-time"
        value={formatNaira(stats?.one_time_revenue ?? 0)}
        loading={loading}
        delay={0.24}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  loading,
  accent = false,
  trendIcon: TrendIcon,
  trendColor,
  delay = 0,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -2 }}
      className="flex flex-col gap-1.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 transition-shadow hover:shadow-md"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      {loading ? (
        <div className="skeleton-shimmer h-8 w-32 rounded" />
      ) : (
        <p
          className={`flex items-center gap-2 font-bold font-mono-ui ${
            accent ? "text-3xl text-[#10B981]" : "text-2xl text-[var(--text-primary)]"
          }`}
        >
          {value}
          {TrendIcon && (
            <TrendIcon className="h-4 w-4" style={{ color: trendColor }} />
          )}
        </p>
      )}
    </motion.div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────

function ChartsRow({ stats }) {
  const monthlyData = stats?.monthly_data ?? [];
  const breakdownData = useMemo(
    () => [
      { name: "Subscription", value: stats?.subscription_revenue ?? 0, fill: "#10B981" },
      { name: "One-time", value: stats?.one_time_revenue ?? 0, fill: "#1E40AF" },
    ],
    [stats]
  );

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Monthly Revenue">
        <div style={{ width: "100%", height: 260 }}>
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

      <ChartCard title="Revenue Split">
        <div className="relative" style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={breakdownData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
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
          <PieCenterTotal data={breakdownData} />
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

function PieCenterTotal({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // Compact rendering: ₦95K
  const compact =
    total >= 1000
      ? `₦${(total / 1000).toFixed(total >= 10000 ? 0 : 1)}K`
      : formatNaira(total);
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Total
        </p>
        <p className="mt-0.5 text-base font-bold text-[var(--text-primary)] font-mono-ui">
          {compact}
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

// ── Quick stats + Filters ─────────────────────────────────────────────────

function QuickStatsRow({ counts }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MiniStat
        icon={CheckCircle}
        color="#10B981"
        label="Successful"
        value={counts.paid}
      />
      <MiniStat icon={Clock} color="#F59E0B" label="Pending" value={counts.pending} />
      <MiniStat icon={XCircle} color="#EF4444" label="Failed" value={counts.failed} />
    </section>
  );
}

function MiniStat({ icon: Icon, color, label, value }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-lg"
        style={{ backgroundColor: `${color}1F`, color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          {label}
        </p>
        <p className="text-xl font-bold text-[var(--text-primary)] font-mono-ui">
          {value}
        </p>
      </div>
    </motion.div>
  );
}

function Filters({ range, setRange, status, setStatus, query, setQuery }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parent, student, or course…"
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Pill
              key={r.key}
              active={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Pill>
          ))}
        </div>
        <div className="h-5 w-px bg-[var(--border-color)]" />
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <Pill
              key={s.key}
              active={status === s.key}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </Pill>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors font-mono-ui ${
        active
          ? "border-[#10B981] bg-[#10B981] text-white"
          : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}
