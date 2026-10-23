import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// Browser-side MSW worker. Start it once at app boot (e.g. in a client
// provider) before any API call fires:
//   if (process.env.NODE_ENV === "development") {
//     const { worker } = await import("@/_lib/mocks/browser");
//     await worker.start({ onUnhandledRequest: "bypass" });
//   }
export const worker = setupWorker(...handlers);
