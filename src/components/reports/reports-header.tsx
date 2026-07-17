import { Suspense } from "react";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { BrandSelector } from "@/components/layout/brand-selector";
import { TenantSelectors } from "@/components/layout/tenant-selectors";

type ReportsHeaderProps = {
  title: string;
  description?: string;
};

/**
 * Reports workspace header: shared scope filters only.
 * Intentionally excludes all operational dashboard actions (sync, auto-sync, refresh side effects).
 */
export function ReportsHeader({ title, description }: ReportsHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <Suspense fallback={<div className="h-10 w-44 animate-pulse rounded-xl bg-card" />}>
            <TenantSelectors />
          </Suspense>
          <Suspense fallback={<div className="h-10 w-40 animate-pulse rounded-xl bg-card" />}>
            <BrandSelector />
          </Suspense>
        </div>
        <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded-xl bg-card" />}>
          <DateRangePicker />
        </Suspense>
      </div>
    </div>
  );
}
