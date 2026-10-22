"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { roleToPath } from "@/_lib/auth/role-routing";

const ADMISSION_REGEX = /^KIT\/\d{2}\/\d{3}$/i;

const schema = z.object({
  identifier: z
    .string()
    .min(1, "Please enter your email or admission number"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values) => {
    const raw = values.identifier.trim();
    // Auto-detect: admission numbers get uppercased so the backend
    // match is case-insensitive on the wire.
    const identifier = ADMISSION_REGEX.test(raw) ? raw.toUpperCase() : raw;

    const res = await signIn("credentials", {
      identifier,
      password: values.password,
      redirect: false,
    });

    if (!res?.ok) {
      toast.error("Invalid email, admission number, or password");
      return;
    }

    const session = await getSession();
    if (session?.user?.must_reset_password) {
      router.push("/force-reset-password");
      router.refresh();
      return;
    }
    router.push(roleToPath(session?.user?.role));
    router.refresh();
  };

  return (
    <motion.form
      onSubmit={handleSubmit(onSubmit)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-4"
      noValidate
    >
      <FieldShell delay={0}>
        <label
          htmlFor="identifier"
          className="text-sm font-semibold text-[#0B1220]"
        >
          Email or Admission Number
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="you@kidsintech.school or KIT/26/001"
          aria-invalid={!!errors.identifier}
          {...register("identifier")}
          className={inputClass(errors.identifier)}
        />
        {errors.identifier ? (
          <FieldError>{errors.identifier.message}</FieldError>
        ) : (
          <span className="text-[11px] font-medium text-gray-500">
            Students: use your admission number (e.g. KIT/26/001)
          </span>
        )}
      </FieldShell>

      <FieldShell delay={0.1}>
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[#0B1220]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
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
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
      </FieldShell>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex justify-end"
      >
        <Link
          href="/forgot-password"
          className="text-sm font-semibold text-[#10B981] transition-colors hover:text-[#059669]"
        >
          Forgot password?
        </Link>
      </motion.div>

      <motion.button
        type="submit"
        disabled={isSubmitting}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting ? "Signing in…" : "Sign In"}
      </motion.button>
    </motion.form>
  );
}

function FieldShell({ children, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex flex-col gap-1.5"
    >
      {children}
    </motion.div>
  );
}

function FieldError({ children }) {
  return <span className="text-xs font-medium text-red-600">{children}</span>;
}

function inputClass(hasError) {
  return `w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#0B1220] placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-300 focus:border-[#10B981] focus:ring-[#10B981]/20"
  }`;
}
