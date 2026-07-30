import type { ReactNode } from "react";
import { Suspense } from "react";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { BrandSelector } from "@/components/layout/brand-selector";
import { SyncButton } from "@/components/dashboard/sync-button";
import { SyncVerificationPanel } from "@/components/dashboard/sync-verification-panel";
import { SidebarMenuButton } from "@/components/layout/sidebar";
import { TenantSelectors } from "@/components/layout/tenant-selectors";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title?: string;
  description?: string;
  showFilters?: boolean;
  /** Optional slot for page-specific controls (mounted, may be invisible). */
  headerExtras?: ReactNode;
  /** When true, header sticks under the top of the scroll viewport. */
  sticky?: boolean;
  /**
   * default — title + filters (other pages)
   * toolbar — controls only, grouped for Dashboard
   */
  variant?: "default" | "toolbar";
};

function HeaderGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>{children}</div>
  );
}

function GroupDivider() {
  return <div className="mx-1 hidden h-7 w-px shrink-0 bg-border/80 lg:block" aria-hidden />;
}

export function PageHeader({
  title,
  description,
  showFilters = true,
  headerExtras,
  sticky = true,
  variant = "default",
}: PageHeaderProps) {
  const shellClass = sticky
    ? "sticky top-0 z-40 -mx-3 mb-4 border-b border-border/80 bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5 xl:-mx-6 xl:px-6 2xl:-mx-8 2xl:px-8"
    : "mb-6";

  if (variant === "toolbar") {
    return (
      <div className={shellClass}>
        <div className="flex h-11 items-center gap-3">
          <SidebarMenuButton className="shrink-0" />
          {showFilters && (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
              <HeaderGroup className="min-w-0 flex-1">
                <Suspense
                  fallback={<div className="h-9 w-44 shrink-0 animate-pulse rounded-lg bg-card" />}
                >
                  <TenantSelectors />
                </Suspense>
                <Suspense
                  fallback={<div className="h-9 w-40 shrink-0 animate-pulse rounded-lg bg-card" />}
                >
                  <BrandSelector />
                </Suspense>
              </HeaderGroup>

              <GroupDivider />

              <HeaderGroup>
                <Suspense
                  fallback={<div className="h-9 w-56 shrink-0 animate-pulse rounded-lg bg-card" />}
                >
                  <DateRangePicker />
                </Suspense>
              </HeaderGroup>

              <GroupDivider />

              <HeaderGroup>
                {headerExtras}
                <Suspense
                  fallback={<div className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-card" />}
                >
                  <SyncVerificationPanel />
                </Suspense>
                <Suspense
                  fallback={<div className="h-9 w-36 shrink-0 animate-pulse rounded-lg bg-card" />}
                >
                  <SyncButton />
                </Suspense>
              </HeaderGroup>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarMenuButton className="shrink-0" />
          {(title || description) && (
            <div className="min-w-0">
              {title ? <h1 className="text-page-title">{title}</h1> : null}
              {description ? (
                <p className="text-kpi-label mt-0.5 truncate">{description}</p>
              ) : null}
            </div>
          )}
        </div>
        {showFilters && (
          <div className="flex flex-nowrap items-center justify-end gap-2">
            <Suspense fallback={<div className="h-9 w-44 shrink-0 animate-pulse rounded-lg bg-card" />}>
              <TenantSelectors />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-40 shrink-0 animate-pulse rounded-lg bg-card" />}>
              <BrandSelector />
            </Suspense>
            {headerExtras}
            <Suspense fallback={<div className="h-9 w-56 shrink-0 animate-pulse rounded-lg bg-card" />}>
              <DateRangePicker />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-card" />}>
              <SyncVerificationPanel />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-32 shrink-0 animate-pulse rounded-lg bg-card" />}>
              <SyncButton />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
