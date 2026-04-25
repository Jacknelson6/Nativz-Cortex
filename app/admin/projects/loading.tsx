export default function Loading() {
  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto py-6 animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-64 rounded bg-surface mb-2" />
        <div className="h-4 w-80 rounded bg-surface mb-4" />
        <div className="flex gap-2 mb-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-full bg-surface" />
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-32 rounded bg-surface" />
          <div className="h-8 w-32 rounded bg-surface" />
          <div className="h-8 flex-1 rounded bg-surface" />
        </div>
      </div>
      <div className="rounded-lg border border-nativz-border bg-surface h-64" />
    </div>
  );
}
