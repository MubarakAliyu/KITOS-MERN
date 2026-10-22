// Mock Service Worker is an offline design aid, never a production dependency.
// When it is off (the default) the two mock entry points resolve to a stub, so
// msw and the 2,100-line fixture file stay out of the module graph. Guarding
// the dynamic imports in JavaScript is not sufficient — Turbopack still emits
// the chunk — and KITOS acceptance criterion AC1.6 requires MSW to be absent
// from the production build.
const MOCKING_ENABLED = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

// Kept as a POSIX, root-relative specifier: Turbopack rejects Windows
// absolute paths in resolveAlias ("windows imports are not implemented yet").
const mockStub = "./src/_lib/mocks/disabled.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project so Turbopack stops warning about
  // sibling lockfiles (e.g. the marketing site's package-lock.json one folder up).
  turbopack: {
    root: process.cwd(),
    resolveAlias: MOCKING_ENABLED
      ? {}
      : {
          "@/_lib/mocks/browser": mockStub,
          "@/_lib/mocks/server": mockStub,
        },
  },
};

export default nextConfig;
