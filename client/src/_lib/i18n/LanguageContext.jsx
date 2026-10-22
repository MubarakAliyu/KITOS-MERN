"use client";

import { createContext, useContext, useCallback } from "react";
import { useAuthStore } from "@/_store/authStore";
import en from "@/_locales/en.json";
import ha from "@/_locales/ha.json";

const LOCALES = { en, ha };

const LanguageContext = createContext({
  t: (key) => key,
  language: "en",
  setLanguage: () => {},
});

// Resolve a dot-notation key against a nested locale object. Returns the
// string if found, otherwise undefined so callers can fall back.
function resolveKey(locale, key) {
  const parts = key.split(".");
  let value = locale;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return typeof value === "string" ? value : undefined;
}

export function LanguageProvider({ children }) {
  const { languagePreference, setLanguagePreference } = useAuthStore();
  const language = languagePreference || "en";
  const locale = LOCALES[language] || LOCALES.en;

  // t('nav.dashboard') → 'Dashboard' / 'Allon Kula'. Falls back to English,
  // then to the literal fallback argument, then to the key itself so missing
  // translations never crash the UI.
  const t = useCallback(
    (key, fallback) => {
      if (typeof key !== "string") return fallback ?? "";
      const localized = resolveKey(locale, key);
      if (localized !== undefined) return localized;
      const englishFallback = resolveKey(en, key);
      if (englishFallback !== undefined) return englishFallback;
      return fallback ?? key;
    },
    [locale]
  );

  const setLanguage = useCallback(
    (lang) => {
      if (lang === "en" || lang === "ha") {
        setLanguagePreference(lang);
      }
    },
    [setLanguagePreference]
  );

  return (
    <LanguageContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
