export function ResultSkeleton() {
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/5 rounded w-24" />
          <div className="h-4 bg-white/8 rounded w-3/4" />
          <div className="h-4 bg-white/8 rounded w-1/2" />
        </div>
        <div className="h-5 bg-white/5 rounded-full w-20 shrink-0" />
      </div>
      <div className="flex gap-3 mb-4">
        <div className="h-3 bg-white/5 rounded w-32" />
        <div className="h-3 bg-white/5 rounded w-24" />
        <div className="h-3 bg-white/5 rounded w-28" />
      </div>
      <div className="flex justify-between items-center">
        <div className="h-4 bg-white/5 rounded w-28" />
        <div className="h-4 bg-white/5 rounded w-20" />
      </div>
    </div>
  );
}
