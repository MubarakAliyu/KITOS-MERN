// Static loading shell used while NextAuth resolves the session in RouteGuard.
// Mirrors the dashboard chrome (sidebar + topbar + cards) so the layout
// shift on auth completion is minimal.

export default function PageSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-gray-200 p-4 gap-3">
        <div className="skeleton-shimmer h-10 w-32 rounded-lg" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="mt-auto skeleton-shimmer h-12 w-full rounded-xl" />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 sm:px-6">
          <div className="skeleton-shimmer h-6 w-40 rounded" />
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer h-7 w-10 rounded-full" />
            <div className="skeleton-shimmer h-9 w-9 rounded-full" />
            <div className="skeleton-shimmer h-9 w-9 rounded-full" />
          </div>
        </div>

        {/* Content cards */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer h-40 w-full rounded-2xl"
              />
            ))}
          </div>
          <div className="mt-6 skeleton-shimmer h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
