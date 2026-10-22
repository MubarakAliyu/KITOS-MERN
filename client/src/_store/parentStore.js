import { create } from "zustand";

// Tracks which child the parent is currently viewing across the parent area.
// Defaults to the first known child id ('s1') so the dashboard renders
// something meaningful before the children list resolves.
export const useParentStore = create((set) => ({
  activeChildId: "s1",
  setActiveChild: (id) => set({ activeChildId: id }),
}));
