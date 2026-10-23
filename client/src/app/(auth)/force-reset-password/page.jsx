"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import SplitScreenLayout from "@/_components/auth/SplitScreenLayout";
import BrandLockup from "@/_components/auth/BrandLockup";
import RightPanel from "@/_components/auth/RightPanel";
import PasswordStrengthBar from "@/_components/auth/PasswordStrengthBar";
import { changePassword } from "@/_lib/api/settings";

const DEFAULT_PASSWORD = "default1234";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .refine(
        (p) => p !== DEFAULT_PASSWORD,
        "Cannot use the default password"
      )
      .refine((p) => /[A-Z]/.test(p), "Must contain an uppercase letter")
      .refine((p) => /\d/.test(p), "Must contain a number"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export default function ForceResetPasswordPage() {
  return (
    <SplitScreenLayout
      left={
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-7"
        >
          <BrandLockup />
          <ForceResetForm />
        </motion.div>
      }
      right={<RightPanel />}
    />
  );
}

function ForceResetForm() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const passwordValue = watch("password", "");
  const confirmValue = watch("confirm", "");

  const reqs = [
    { label: "At least 8 characters", ok: passwordValue.length >= 8 },
    {
      label: 'Different from default ("default1234")',
      ok: passwordValue.length > 0 && passwordValue !== DEFAULT_PASSWORD,
    },
    { label: "Contains uppercase", ok: /[A-Z]/.test(passwordValue) },
    { label: "Contains a number", ok: /\d/.test(passwordValue) },
    {
      label: "Passwords match",
      ok: passwordValue.length > 0 && passwordValue === confirmValue,
    },
  ];

  const onSubmit = async (values) => {
    try {
      await changePassword({
        temp_token: session?.user?.temp_token,
        new_password: values.password,
      });
      // Drop the force-reset session — user logs in fresh with the new
      // password. We pass ?reset=success so the login page shows a toast.
      await signOut({ redirect: false });
      router.replace("/login?reset=success");
    } catch {
      toast.error("Couldn't update password — try again");
    }
  };

  return (
    <>
      <header className="flex flex-col items-start gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#10B981]/15 text-[#10B981]">
          <Lock className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <h1 className="text-3xl font-bold text-[#0B1220] sm:text-4xl">
          Set Your Password
        </h1>
        <p className="text-sm text-gray-500 sm:text-base">
          This is your first login. Please set a new password to continue.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          strokeWidth={2.5}
        />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          You&apos;re using the default password. Create a secure password to
          protect your account.
        </p>
      </div>

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
            <span className="text-xs font-medium text-red-600">
              {errors.password.message}
            </span>
          )}
          <PasswordStrengthBar value={passwordValue} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-sm font-semibold text-[#0B1220]">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              aria-invalid={!!errors.confirm}
              {...register("confirm")}
              className={`${inputClass(errors.confirm)} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirm && (
            <span className="text-xs font-medium text-red-600">
              {errors.confirm.message}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
          {reqs.map((r) => (
            <li
              key={r.label}
              className="flex items-center gap-2 text-xs font-medium font-mono-ui"
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-full ${
                  r.ok ? "bg-[#10B981] text-white" : "bg-red-500 text-white"
                }`}
              >
                {r.ok ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  <X className="h-3 w-3" strokeWidth={3} />
                )}
              </span>
              <span className={r.ok ? "text-[#0B1220]" : "text-gray-600"}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>

        <motion.button
          type="submit"
          disabled={isSubmitting}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Saving…" : "Set Password & Continue"}
        </motion.button>
      </form>
    </>
  );
}

function inputClass(hasError) {
  return `w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#0B1220] placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-300 focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
