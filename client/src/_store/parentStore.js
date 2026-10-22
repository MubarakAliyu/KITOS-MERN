import { create } from "zustand";

// Tracks which child the parent is currently viewing across the parent area.
//
// Starts as null, not a guessed id. It used to default to "s1", the first
// child in the mock fixtures, which was harmless while MSW answered every
// request but against the real API fires GET /students/s1/progress before the
// children list resolves — a 400, since "s1" is not an ObjectId, and a console
// error on every parent dashboard load.
//
// Consumers already skip the fetch while this is null and set it to the first
// real child once the list arrives, so nothing else needs to change.
export const useParentStore = create((set) => ({
  activeChildId: null,
  setActiveChild: (id) => set({ activeChildId: id }),
}));
