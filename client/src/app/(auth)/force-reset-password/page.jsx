"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut, getSession } from "next-auth/react";
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
import { apiErrorMessage, apiFieldErrors } from "@/_lib/api/errors";
import { roleToPath } from "@/_lib/auth/role-routing";

/**
 * The rule about `default1234` is gone.
 *
 * It was written when every new account got one shared default password. They
 * have not for some time: `generateTempPassword` issues a random one per
 * account, and an administrator reads it off the screen. Telling somebody
 * their new password must differ from a string they have never seen was
 * noise, and naming the old default in the UI advertised it.
 */
const schema = z
  .object({
    current_password: z
      .string()
      .min(1, "Enter the temporary password you signed in with"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .refine((p) => /[A-Z]/.test(p), "Must contain an uppercase letter")
      .refine((p) => /\d/.test(p), "Must contain a number"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  })
  .refine((d) => d.password !== d.current_password, {
    message: "Choose a password different from the temporary one",
    path: ["password"],
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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const currentValue = watch("current_password", "");
  const passwordValue = watch("password", "");
  const confirmValue = watch("confirm", "");

  const reqs = [
    { label: "At least 8 characters", ok: passwordValue.length >= 8 },
    {
      label: "Different from the temporary password",
      ok: passwordValue.length > 0 && passwordValue !== currentValue,
    },
    { label: "Contains uppercase", ok: /[A-Z]/.test(passwordValue) },
    { label: "Contains a number", ok: /\d/.test(passwordValue) },
    {
      label: "Passwords match",
      ok: passwordValue.length > 0 && passwordValue === confirmValue,
    },
  ];

  // Students have no email address, so they are known by admission number.
  const identifier = session?.user?.admission_no || session?.user?.email || "";

  const onSubmit = async (values) => {
    try {
      await changePassword({
        temp_token: session?.user?.temp_token,
        current_password: values.current_password,
        new_password: values.password,
      });
    } catch (error) {
      /**
       * The server's own message, on the field it belongs to.
       *
       * "Couldn't update password — try again" was the only thing this
       * screen ever said, which is useless advice when the answer is "that
       * is not the temporary password you signed in with".
       */
      const fields = apiFieldErrors(error);
      for (const [field, message] of Object.entries(fields)) {
        setError(field, { type: "server", message });
      }
      if (Object.keys(fields).length === 0) {
        /**
         * The server's own sentence, not a stock one.
         *
         * Writing this test turned up a rate-limited response — "Too many
         * attempts. Please try again later." — that this screen showed as
         * "try again", advice that was not only unhelpful but wrong.
         */
        toast.error(
          apiErrorMessage(error, "Couldn't update password — try again")
        );
      }
      return;
    }

    /**
     * The password is set. Now finish the job and sign them in with it.
     *
     * The old flow signed out and sent them back to /login to type a password
     * they had just typed twice. Signing in here lands them on their own
     * dashboard, which is what "& Continue" on the button promises.
     *
     * The force-reset session has to go either way: its token was revoked by
     * the change (`revokeTokens`), so it would 401 on the first request a
     * dashboard made.
     */
    const signedIn = await signIn("credentials", {
      identifier,
      password: values.password,
      redirect: false,
    });

    if (signedIn?.ok) {
      const fresh = await getSession();
      toast.success("Password set. Welcome in.");
      router.replace(roleToPath(fresh?.user?.role ?? session?.user?.role));
      router.refresh();
      return;
    }

    // The change went through even if signing in afterwards did not, so send
    // them to sign in by hand rather than implying the password did not save.
    await signOut({ redirect: false });
    router.replace("/login?reset=success");
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
          You signed in with a temporary password. Choose one of your own to
          finish setting up your account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {/*
          The temporary password, asked for again.

          The API requires it on this path: a change that proves nothing about
          who is asking is a change anybody holding the page can make. They
          typed it a moment ago to get here, so it is still to hand.
        */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="current_password"
            className="text-sm font-semibold text-[#0B1220]"
          >
            Temporary password
          </label>
          <div className="relative">
            <input
              id="current_password"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              placeholder="The password you just signed in with"
              aria-invalid={!!errors.current_password}
              {...register("current_password")}
              className={`${inputClass(errors.current_password)} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={
                showCurrent
                  ? "Hide temporary password"
                  : "Show temporary password"
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
            >
              {showCurrent ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.current_password && (
            <span className="text-xs font-medium text-red-600">
              {errors.current_password.message}
            </span>
          )}
        </div>

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
