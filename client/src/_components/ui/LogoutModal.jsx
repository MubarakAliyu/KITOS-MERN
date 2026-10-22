"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { LogOut } from "lucide-react";
import { useLanguage } from "@/_lib/i18n/LanguageContext";

export default function LogoutModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  // Escape closes the modal — keeps keyboard parity with the X-style affordance
  // even though this dialog only exposes Cancel / Confirm.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, loading]);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    // Clear the session WITHOUT letting NextAuth build the redirect URL. Its
    // default redirect resolves relative paths against NEXTAUTH_URL (a
    // different port in dev, e.g. :3001), which bounces logout to the wrong
    // origin. Navigating ourselves keeps us on the current origin.
    await signOut({ redirect: false });
    window.location.href = "/login";
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          {/* Modal — centering wrapper is click-through so the backdrop
              actually receives the click; the card itself stops propagation. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm logout"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center shadow-2xl"
            >
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#10B981]/15">
                <LogOut className="h-7 w-7 text-[#10B981]" strokeWidth={2.2} />
              </div>
              <h2 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
                {t("auth.logoutConfirmTitle")}
              </h2>
              <p className="mb-6 text-sm text-[var(--text-secondary)]">
                {t("auth.logoutConfirmBody")}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {t("auth.loggingOut")}
                    </>
                  ) : (
                    t("auth.logoutConfirmYes")
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="w-full rounded-xl border border-[var(--border-color)] py-3 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Named export alias — lets either `import LogoutModal from ...` or
// `import { LogoutModal } from ...` work, so we don't have to retouch
// every call site if a future file uses the named-import style.
export { LogoutModal };
