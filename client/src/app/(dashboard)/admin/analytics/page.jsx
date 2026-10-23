"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAdminAnalytics } from "@/_lib/api/admin";
import { useCountUp } from "@/_hooks/useCountUp";

function formatNaira(n) {
  return `₦${Number(n).toLocaleString("en-NG")}`;
}

function completionColor(v) {
  if (v >= 70) return "#10B981";
  if (v >= 40) return "#F59E0B";
  return "#EF4444";
}

const INSTRUCTOR_TABLE = [
  { name: "Ms. Sarah Aliyu", courses: 2, students: 3, completion: 51, quiz: 78 },
  { name: "Mr. Ahmed Bello", courses: 1, students: 0, completion: 0, quiz: null },
];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setError(null);
    getAdminAnalytics()
      .then(setData)
      .catch((err) => {
        console.warn("Analytics fetch failed:", err.message);
        setError("Failed to load analytics. Please refresh.");
      });
  }, [pathname]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-8"
    >
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Analytics &amp; Insights
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Cross-platform metrics for students, revenue, and engagement.
        </p>
      </header>

      {error && <ErrorState message={error} />}

      {!error && (
        <>
          <Section title="Student Performance">
            <ChartCard title="Student Enrollment Trend (6 Months)">
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.enrollment_trend ?? []}
                    margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
                  >
                    <defs>
                      <linearGradient id="enrollGradAna" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={32} />
                    <Tooltip content={<EnrollTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="students"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#enrollGradAna)"
                      animationBegin={0}
                      animationDuration={1200}
                      dot={{ fill: "#10B981", r: 4 }}
                      activeDot={{ r: 6, fill: "#059669" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Course Completion Rates">
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data?.course_completion ?? []}
                    margin={{ top: 8, right: 32, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                    <YAxis type="category" dataKey="course" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={80} />
                    <Tooltip cursor={{ fill: "rgba(16,185,129,0.06)" }} formatter={(v) => [`${v}%`, "Completion"]} />
                    <Bar dataKey="rate" radius={[0, 6, 6, 0]} animationDuration={1200}>
                      {(data?.course_completion ?? []).map((e, i) => (
                        <Cell key={i} fill={completionColor(e.rate)} />
                      ))}
                      <LabelList dataKey="rate" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </Section>

          <Section title="Revenue Metrics">
            <RevenueHero data={data} />

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Monthly Revenue Breakdown">
                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.revenue_monthly ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                      <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={48} />
                      <Tooltip content={<RevenueTooltip />} cursor={{ fill: "rgba(16,185,129,0.06)" }} />
                      <Bar dataKey="subscription" stackId="rev" fill="#10B981" animationDuration={1200} />
                      <Bar dataKey="one_time" stackId="rev" fill="#1a2234" radius={[6, 6, 0, 0]} animationDuration={1200} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Payment Split">
                <PaymentDonut data={data?.payment_split ?? []} />
              </ChartCard>
            </div>
          </Section>

          <Section title="Instructor Metrics">
            <InstructorTable rows={data?.instructors ?? []} />
          </Section>

          <Section title="Engagement">
            <ChartCard title="Quiz Score Trend">
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.quiz_performance ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={36} />
                    <Tooltip formatter={(v) => [`${v}%`, "Avg score"]} />
                    <ReferenceLine y={70} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "Target 70%", fill: "#F59E0B", fontSize: 10, position: "right" }} />
                    <ReferenceLine y={90} stroke="#10B981" strokeDasharray="4 4" label={{ value: "Excellent 90%", fill: "#10B981", fontSize: 10, position: "right" }} />
                    <Line type="monotone" dataKey="average" stroke="#10B981" strokeWidth={3} dot={{ fill: "#10B981", r: 5, strokeWidth: 2, stroke: "white" }} activeDot={{ r: 7, fill: "#059669" }} animationDuration={1200} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Most Popular" value="Scratch Programming" sub="2 students enrolled" />
              <StatCard label="Avg Quiz Score" value="78%" />
              <StatCard label="Assignments Reviewed" value="2 of 3" />
            </div>
          </Section>
        </>
      )}
    </motion.div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-bold text-[var(--text-primary)] font-mono-ui">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RevenueHero({ data }) {
  const split = data?.payment_split ?? [];
  const sub = split.find((d) => d.name === "Subscription")?.value ?? 0;
  const one = split.find((d) => d.name === "One-time")?.value ?? 0;
  const total = sub + one;
  const count = useCountUp(total);
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
      <p className="text-3xl font-bold text-[#10B981] font-mono-ui sm:text-4xl">
        {formatNaira(count)}
      </p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Total Revenue to Date
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-[#10B981]/10 px-2.5 py-1 text-xs font-bold text-[#10B981] font-mono-ui">
          {formatNaira(sub)} Subscriptions
        </span>
        <span className="rounded-full bg-[#3B82F6]/10 px-2.5 py-1 text-xs font-bold text-[#3B82F6] font-mono-ui">
          {formatNaira(one)} One-time
        </span>
      </div>
    </div>
  );
}

function PaymentDonut({ data }) {
  const total = data.reduce((s, d) => s + (d.value ?? 0), 0);
  return (
    <div style={{ position: "relative", width: "100%", height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            stroke="var(--bg-card)"
            strokeWidth={2}
            animationBegin={0}
            animationDuration={1200}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatNaira(v)} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          top: "44%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div className="text-base font-bold text-[var(--text-primary)] font-mono-ui">
          {`₦${(total / 1000).toFixed(0)}K`}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] font-mono-ui">
          Total
        </div>
      </div>
    </div>
  );
}

function InstructorTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
          <tr>
            <Th>Instructor</Th>
            <Th>Courses</Th>
            <Th>Students</Th>
            <Th>Avg Completion</Th>
            <Th>Avg Quiz Score</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.name}
              className={`border-b border-[var(--border-color)] last:border-b-0 ${
                i % 2 === 1 ? "bg-[var(--bg-secondary)]/30" : ""
              }`}
            >
              <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                {r.name}
              </td>
              <td className="px-4 py-3 text-[var(--text-primary)] font-mono-ui">
                {r.courses}
              </td>
              <td className="px-4 py-3 text-[var(--text-primary)] font-mono-ui">
                {r.students}
              </td>
              <td className="px-4 py-3 font-mono-ui" style={{ color: completionColor(r.completion) }}>
                {r.completion}%
              </td>
              <td className="px-4 py-3 text-[var(--text-primary)] font-mono-ui">
                {r.quiz != null ? `${r.quiz}%` : "N/A"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider font-mono-ui">
      {children}
    </th>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && (
        <p className="mt-1 text-xs text-[var(--text-secondary)] font-mono-ui">
          {sub}
        </p>
      )}
    </div>
  );
}

function EnrollTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      <p className="text-sm font-bold text-[#10B981] font-mono-ui">
        {payload[0].value} students enrolled
      </p>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="min-w-[10rem] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 shadow-lg">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 text-xs font-mono-ui">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="text-[var(--text-primary)]">{formatNaira(p.value)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-[var(--border-color)] pt-1.5 text-xs font-bold font-mono-ui">
        <span className="text-[var(--text-secondary)]">Total</span>
        <span className="text-[#10B981]">{formatNaira(total)}</span>
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-12 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 text-sm font-semibold text-[#10B981] underline transition-colors hover:text-[#059669] font-mono-ui"
      >
        Refresh page
      </button>
    </div>
  );
}
