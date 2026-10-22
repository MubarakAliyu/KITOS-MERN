import { create } from "zustand";

// `isOpen` controls the mobile overlay state (hamburger toggles it).
// `isCollapsed` controls the desktop icon-only collapse mode.
export const useSidebarStore = create((set) => ({
  isOpen: false,
  isCollapsed: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  toggleCollapse: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
  close: () => set({ isOpen: false }),
}));
