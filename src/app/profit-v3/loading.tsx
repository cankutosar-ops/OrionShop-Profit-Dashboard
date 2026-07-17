export default function ProfitDashboardV3Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-lg bg-card" />
          <div className="h-4 w-80 max-w-full rounded-lg bg-card" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-40 rounded-xl bg-card" />
          <div className="h-10 w-64 rounded-xl bg-card" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-2xl bg-card" />
        <div className="h-28 rounded-2xl bg-card" />
        <div className="h-28 rounded-2xl bg-card" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-card" />
    </div>
  );
}
