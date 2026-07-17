import type { ReactNode } from "react";
import { Suspense } from "react";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { BrandSelector } from "@/components/layout/brand-selector";
import { SyncButton } from "@/components/dashboard/sync-button";
import { SidebarMenuButton } from "@/components/layout/sidebar";
import { TenantSelectors } from "@/components/layout/tenant-selectors";

type PageHeaderProps = {
  title: string;
  description?: string;
  showFilters?: boolean;
  /** Optional slot rendered beside marketplace selectors (Dashboard-only extras). */
  headerExtras?: ReactNode;
  /** When true, header sticks under the top of the scroll viewport. */
  sticky?: boolean;
};

export function PageHeader({
  title,
  description,
  showFilters = true,
  headerExtras,
  sticky = true,
}: PageHeaderProps) {
  return (
    <div
      className={
        sticky
          ? "sticky top-0 z-40 -mx-3 mb-4 border-b border-border/80 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5 xl:-mx-6 xl:px-6 2xl:-mx-8 2xl:px-8"
          : "mb-6"
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <SidebarMenuButton className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Suspense fallback={<div className="h-9 w-44 animate-pulse rounded-lg bg-card" />}>
              <TenantSelectors />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-40 animate-pulse rounded-lg bg-card" />}>
              <BrandSelector />
            </Suspense>
            {headerExtras}
            <Suspense fallback={<div className="h-9 w-56 animate-pulse rounded-lg bg-card" />}>
              <DateRangePicker />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-32 animate-pulse rounded-lg bg-card" />}>
              <SyncButton />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
