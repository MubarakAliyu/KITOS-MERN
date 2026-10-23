"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { LayoutDashboard, Users, BarChart3, Award } from "lucide-react";

const ROTATION_MS = 2800;

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Course Dashboard",
    body: "Easy course creation and management",
  },
  {
    icon: Users,
    title: "Student Management",
    body: "Manage enrollments and grades",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    body: "Track performance and engagement",
  },
  {
    icon: Award,
    title: "Certificates",
    body: "Auto-issue on course completion",
  },
];

const STATS = [
  { value: "500+", label: "Students" },
  { value: "50+", label: "Courses" },
  { value: "95%", label: "Completion" },
];

const HEADLINE_WHITE = "Empower the next";
const HEADLINE_TEAL = "generation of tech";

export default function RightPanel() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-rotate the highlighted feature card. Loops indefinitely until the
  // panel unmounts; pause-on-hover is intentionally skipped per spec.
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FEATURES.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full">
      <BackgroundDecor />

      <div className="relative z-10 flex flex-col gap-8 lg:gap-10">
        {/* Pill badge */}
        <motion.span
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
          EST · LMS PLATFORM
        </motion.span>

        {/* Headline */}
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
          <AnimatedHeadline text={HEADLINE_WHITE} className="text-white" delayBase={0.1} />
          <br />
          <AnimatedHeadline text={HEADLINE_TEAL} className="text-[#10B981]" delayBase={0.4} />
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="max-w-md text-sm leading-relaxed text-white/60 sm:text-base"
        >
          A comprehensive learning management system designed for modern tech education.
        </motion.p>

        {/* Features list — one card highlights at a time, rotating on a timer */}
        <ul className="flex flex-col gap-3">
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              feature={f}
              index={i}
              isActive={i === activeIndex}
            />
          ))}
        </ul>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.2 }}
          className="flex items-center gap-4 pt-2 text-sm text-white/70 sm:gap-6"
        >
          {STATS.map((s, i) => (
            <span key={s.label} className="flex items-center gap-4 sm:gap-6">
              {i > 0 && <span aria-hidden="true" className="text-white/30">·</span>}
              <span>
                <span className="font-bold text-white">{s.value}</span>{" "}
                <span className="text-white/60">{s.label}</span>
              </span>
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function AnimatedHeadline({ text, className, delayBase }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: delayBase + i * 0.08 }}
          className="inline-block"
        >
          {word}
          {i < words.length - 1 && " "}
        </motion.span>
      ))}
    </span>
  );
}

function FeatureCard({ feature, index, isActive }) {
  const Icon = feature.icon;

  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.8 + index * 0.1 }}
      className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/10 p-3 backdrop-blur sm:p-4"
    >
      {/* Animated background tint — appears only while this card is active */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl bg-[#10B981]"
        initial={false}
        animate={{ opacity: isActive ? 0.1 : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      {/* Teal left border — slides in/out with the active state */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] origin-top bg-[#10B981]"
        initial={false}
        animate={{ scaleY: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />

      <motion.div
        initial={false}
        animate={{
          backgroundColor: isActive ? "rgba(16,185,129,1)" : "rgba(255,255,255,0.10)",
          color: isActive ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.75)",
        }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg"
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: isActive ? 1 : 0.5 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative flex flex-col"
      >
        <span className="text-sm font-semibold text-white">{feature.title}</span>
        <span className="text-xs text-white/70 sm:text-sm">{feature.body}</span>
      </motion.div>
    </motion.li>
  );
}

function BackgroundDecor() {
  // Radial gradient + 4 slow floating particles. Keep absolute so they sit
  // behind content without affecting layout.
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(80% 60% at 80% 0%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(59,130,246,0.10), transparent 60%)",
        }}
      />
      {[
        { size: 200, top: "10%", left: "65%", duration: 14 },
        { size: 140, top: "60%", left: "10%", duration: 18 },
        { size: 90, top: "30%", left: "30%", duration: 22 },
        { size: 60, top: "78%", left: "80%", duration: 16 },
      ].map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[#10B981]/8 blur-2xl"
          style={{ width: p.size, height: p.size, top: p.top, left: p.left }}
          animate={{ y: [0, -18, 0], x: [0, 12, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
