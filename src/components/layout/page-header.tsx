import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { SyncButton } from "@/components/dashboard/sync-button";
import { Suspense } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  showFilters?: boolean;
};

export function PageHeader({ title, description, showFilters = true }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {showFilters && (
        <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
          <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded-xl bg-card" />}>
            <DateRangePicker />
          </Suspense>
          <SyncButton />
        </div>
      )}
    </div>
  );
}
