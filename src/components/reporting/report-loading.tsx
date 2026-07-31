export function ReportLoading({ label = "Loading report…" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
