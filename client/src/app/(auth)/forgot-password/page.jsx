"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import SplitScreenLayout from "@/_components/auth/SplitScreenLayout";
import BrandLockup from "@/_components/auth/BrandLockup";
import RightPanel from "@/_components/auth/RightPanel";
import { requestPasswordReset } from "@/_lib/api/auth";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
});

export default function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const onSubmit = async (values) => {
    // Always show success — never leak whether the email is registered.
    await requestPasswordReset({ email: values.email }).catch(() => {});
    setSubmittedEmail(values.email);
  };

  return (
    <SplitScreenLayout
      left={
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-8"
        >
          <BrandLockup />

          <Link
            href="/login"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#0B1220]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          {submittedEmail ? (
            <SuccessState email={submittedEmail} />
          ) : (
            <>
              <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-[#0B1220] sm:text-4xl">Forgot password?</h1>
                <p className="text-sm text-gray-500 sm:text-base">
                  Enter your email and we&apos;ll send a reset link
                </p>
              </header>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-semibold text-[#0B1220]">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@kidsintech.school"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                    className={inputClass(errors.email)}
                  />
                  {errors.email && (
                    <span className="text-xs font-medium text-red-600">{errors.email.message}</span>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Sending…" : "Send Reset Link"}
                </motion.button>
              </form>
            </>
          )}
        </motion.div>
      }
      right={<RightPanel />}
    />
  );
}

function SuccessState({ email }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="flex flex-col items-start gap-5 rounded-2xl border border-[#10B981]/30 bg-[#10B981]/5 p-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.1 }}
        className="grid h-12 w-12 place-items-center rounded-full bg-[#10B981] text-white"
      >
        <Check className="h-6 w-6" strokeWidth={3} />
      </motion.div>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-[#0B1220]">Check your inbox</h2>
        <p className="text-sm text-gray-600 sm:text-base">
          We sent a reset link to <span className="font-semibold text-[#0B1220]">{email}</span>
        </p>
      </div>
      <Link
        href="/login"
        className="text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669]"
      >
        Return to login →
      </Link>
    </motion.div>
  );
}

function inputClass(hasError) {
  return `w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#0B1220] placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-300 focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
