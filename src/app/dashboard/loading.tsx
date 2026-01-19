/**
 * Dashboard Loading Skeleton
 * Displayed while dashboard pages are loading
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-zinc-800 rounded-lg" />
        <div className="h-4 w-64 bg-zinc-800/50 rounded-lg" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-zinc-900/50 rounded-2xl border border-zinc-800" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-64 bg-zinc-900/50 rounded-2xl border border-zinc-800" />
        <div className="lg:col-span-2 h-64 bg-zinc-900/50 rounded-2xl border border-zinc-800" />
      </div>
    </div>
  );
}
