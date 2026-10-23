"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, CheckCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/_lib/i18n/LanguageContext";
import { useAuthStore } from "@/_store/authStore";
import { apiClient } from "@/_lib/api/client";

// Shared "Language" tab — rendered by all four dashboard settings pages
// (student/parent/instructor/admin). Picks between English and Hausa and
// persists via the auth store + a stub PUT /user/language for the backend
// hand-off later.
export default function LanguageTab() {
  const { t, language } = useLanguage();
  const setLanguagePreference = useAuthStore(
    (s) => s.setLanguagePreference
  );
  const [selected, setSelected] = useState(language);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    // Update client state first so the UI flips instantly — even if the
    // backend hop fails we still respect the user's choice.
    setLanguagePreference(selected);
    try {
      await apiClient.put("/user/language", {
        language_preference: selected,
      });
    } catch (err) {
      console.warn("Language sync failed:", err?.message);
    } finally {
      setSaving(false);
      toast.success(t("settings.languageSaved"));
    }
  }

  const dirty = selected !== language;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {t("settings.languagePreference")}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("settings.selectLanguage")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LangCard
          code="en"
          label={t("settings.english")}
          subLabel="English (Default)"
          active={selected === "en"}
          onSelect={() => setSelected("en")}
        />
        <LangCard
          code="ha"
          label={t("settings.hausa")}
          subLabel="Hausa (Beta)"
          active={selected === "ha"}
          onSelect={() => setSelected("ha")}
        />
      </div>

      <AnimatePresence>
        {selected === "ha" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
          >
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-500"
            />
            <p className="text-[var(--text-secondary)]">
              {t("settings.languageScopeNote")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !dirty}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {saving ? t("common.loading") : t("settings.savePreference")}
      </button>

      {!dirty && (
        <p className="text-center text-xs text-[var(--text-muted)] font-mono-ui">
          {language === "en" ? t("settings.english") : t("settings.hausa")}{" "}
          {t("settings.isCurrentLanguage")}
        </p>
      )}
    </div>
  );
}

function LangCard({ code, label, subLabel, active, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-xl border-2 p-5 text-left transition-all ${
        active
          ? "border-[#10B981] bg-[#10B981]/5"
          : "border-[var(--border-color)] hover:border-[#10B981]/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono-ui text-2xl font-bold text-[#10B981]">
          {code.toUpperCase()}
        </span>
        {active && <CheckCircle size={20} className="text-[#10B981]" />}
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </p>
      <p className="text-xs text-[var(--text-muted)] font-mono-ui">
        {subLabel}
      </p>
    </button>
  );
}
