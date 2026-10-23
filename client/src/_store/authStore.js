import { create } from "zustand";
import { persist } from "zustand/middleware";

// User identity / role / token live in NextAuth's session — this store only
// holds local UI state that needs to survive a refresh (currently the user's
// chosen UI language). Keep additions here narrowly scoped to client state.
//
// `partialize` keeps localStorage focused on the fields we actually want to
// persist, so future additions of transient state here won't leak across
// sessions.
export const useAuthStore = create(
  persist(
    (set) => ({
      languagePreference: "en",
      setLanguagePreference: (lang) => set({ languagePreference: lang }),
    }),
    {
      name: "kit-lms-auth",
      partialize: (state) => ({
        languagePreference: state.languagePreference,
      }),
    }
  )
);
