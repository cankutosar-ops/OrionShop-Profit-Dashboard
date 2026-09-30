export default function ProfitDashboardV3Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading dashboard">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-lg bg-muted/35" />
          <div className="h-4 w-80 max-w-full rounded-lg bg-muted/25" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-40 rounded-xl bg-muted/30" />
          <div className="h-10 w-64 rounded-xl bg-muted/30" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="surface-card h-28 bg-card/70" />
        <div className="surface-card h-28 bg-card/70" />
        <div className="surface-card h-28 bg-card/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="surface-card h-28 bg-card/70" />
        ))}
      </div>
      <div className="surface-card h-72 bg-card/70" />
    </div>
  );
}
