// Next.js server-runtime instrumentation hook.
//
// Starts the Node-side MSW server so requests fired from the Next.js server
// runtime — chiefly NextAuth's CredentialsProvider `authorize()` callback,
// which posts to /login through axios — are intercepted alongside the browser
// worker. Without this the browser would see mocks while sign-in hit the
// network, and the two would disagree.
//
// Gated on NEXT_PUBLIC_API_MOCKING === "enabled" exactly as MSWProvider is.
// With mocking off (the default, and always in production) this is a no-op
// and the import is unreachable, so `msw/node` stays out of the bundle.
export async function register() {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { server } = await import("@/_lib/mocks/server");
  server.listen({ onUnhandledRequest: "bypass" });
  console.info("[MSW] Node-side mock server started (API mocking enabled).");
}
