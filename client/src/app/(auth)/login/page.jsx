"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import SplitScreenLayout from "@/_components/auth/SplitScreenLayout";
import BrandLockup from "@/_components/auth/BrandLockup";
import RightPanel from "@/_components/auth/RightPanel";
import GoogleOAuthButton from "@/_components/auth/GoogleOAuthButton";
import EmailDivider from "@/_components/auth/EmailDivider";
import LoginForm from "@/_components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const reset = params.get("reset");

  useEffect(() => {
    if (reset === "success") {
      toast.success("Password updated! Please sign in.", {
        duration: 4000,
      });
    }
  }, [reset]);

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

          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-[#0B1220] sm:text-4xl">Welcome back</h1>
            <p className="text-sm text-gray-500 sm:text-base">
              Sign in to manage or continue your learning journey
            </p>
          </header>

          <div className="flex flex-col gap-4">
            <GoogleOAuthButton />
            <EmailDivider />
            <LoginForm />
          </div>
        </motion.div>
      }
      right={<RightPanel />}
    />
  );
}
