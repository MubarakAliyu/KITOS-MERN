"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import SplitScreenLayout from "@/_components/auth/SplitScreenLayout";
import BrandLockup from "@/_components/auth/BrandLockup";
import RightPanel from "@/_components/auth/RightPanel";
import PasswordStrengthBar from "@/_components/auth/PasswordStrengthBar";
import { resetPassword } from "@/_lib/api/auth";

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

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
          {token ? <ResetForm token={token} router={router} /> : <InvalidLinkState />}
        </motion.div>
      }
      right={<RightPanel />}
    />
  );
}

function ResetForm({ token, router }) {
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const passwordValue = watch("password", "");

  const onSubmit = async (values) => {
    try {
      await resetPassword({ token, password: values.password });
      toast.success("Password reset successful — please sign in");
      router.push("/login");
    } catch {
      toast.error("Could not reset password. The link may be expired.");
    }
  };

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[#0B1220] sm:text-4xl">Set new password</h1>
        <p className="text-sm text-gray-500 sm:text-base">
          Choose a strong password you haven&apos;t used before
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold text-[#0B1220]">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              {...register("password")}
              className={`${inputClass(errors.password)} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <span className="text-xs font-medium text-red-600">{errors.password.message}</span>
          )}
          <PasswordStrengthBar value={passwordValue} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-sm font-semibold text-[#0B1220]">
            Confirm password
          </label>
          <input
            id="confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            aria-invalid={!!errors.confirm}
            {...register("confirm")}
            className={inputClass(errors.confirm)}
          />
          {errors.confirm && (
            <span className="text-xs font-medium text-red-600">{errors.confirm.message}</span>
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
          {isSubmitting ? "Resetting…" : "Reset Password"}
        </motion.button>
      </form>
    </>
  );
}

function InvalidLinkState() {
  return (
    <div className="flex flex-col items-start gap-5 rounded-2xl border border-red-200 bg-red-50 p-6">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-red-500 text-white">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-[#0B1220]">Invalid or expired link</h2>
        <p className="text-sm text-gray-600 sm:text-base">
          This password reset link is no longer valid. Request a new one to continue.
        </p>
      </div>
      <Link
        href="/forgot-password"
        className="text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669]"
      >
        Request new link →
      </Link>
    </div>
  );
}

function inputClass(hasError) {
  return `w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#0B1220] placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-300 focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
