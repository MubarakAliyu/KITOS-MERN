import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Node-side MSW server. Started from `instrumentation.js` so that requests
// fired from the Next.js server runtime (e.g. NextAuth's CredentialsProvider
// authorize() callback hitting POST /login via axios) are intercepted in dev.
export const server = setupServer(...handlers);
