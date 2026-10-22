// Stub that stands in for the MSW entry points when API mocking is off.
//
// `next.config.mjs` aliases `@/_lib/mocks/browser` and `@/_lib/mocks/server`
// to this file unless NEXT_PUBLIC_API_MOCKING is "enabled". Dead-code
// elimination alone is not enough: Turbopack still emits the chunk behind a
// dynamic `import()` even when the guard around it is statically false, which
// would leave msw in the production bundle and break AC1.6. Cutting the module
// graph at resolution keeps msw out entirely.
//
// Nothing here should ever run — the callers return before importing when
// mocking is disabled — so both exports throw rather than fail quietly.
function unavailable() {
  throw new Error(
    "MSW is not bundled in this build. Set NEXT_PUBLIC_API_MOCKING=enabled and rebuild to use the mock handlers."
  );
}

export const worker = {
  start: unavailable,
  stop: unavailable,
};

export const server = {
  listen: unavailable,
  close: unavailable,
};
