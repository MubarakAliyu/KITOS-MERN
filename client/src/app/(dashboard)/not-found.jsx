"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Home } from "lucide-react";
import { useLanguage } from "@/_lib/i18n/LanguageContext";

const ROLE_HOMES = {
  admin: "/admin",
  instructor: "/instructor",
  student: "/student",
  parent: "/parent",
};

export default function DashboardNotFound() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const home = ROLE_HOMES[session?.user?.role] ?? "/login";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <div className="relative">
        <div className="select-none text-[120px] font-bold leading-none text-[var(--border-color)]">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[#10B981]/10">
            <Home className="h-9 w-9 text-[#10B981]" strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Page not found
        </h1>
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
          The page you are looking for does not exist or you do not have access
          to it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.goBack")}
        </button>
        <button
          type="button"
          onClick={() => router.push(home)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#059669] active:scale-95"
        >
          <Home className="h-4 w-4" />
          {t("nav.dashboard")}
        </button>
      </div>
    </motion.div>
  );
}
