"use client";

import { Suspense, useMemo, useState, useEffect, useRef } from "react";
import { Layers } from "lucide-react";
import { SyncButton } from "@/components/dashboard/sync-button";
import { BrandSelector } from "@/components/layout/brand-selector";
import { TenantSelectors } from "@/components/layout/tenant-selectors";
import { formatLastSyncTimestamp } from "@/lib/marketplace-sync-date";
import { cn } from "@/lib/utils";

export type InventoryCategoryOption = {
  id: string;
  name: string;
};

type InventoryFiltersProps = {
  categoryOptions: InventoryCategoryOption[];
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
  /** Account last successful sync — display only (current stock snapshot). */
  accountLastSync: string | null;
};

function CategoryDropdown({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: InventoryCategoryOption[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const allOption = { id: "", name: "All Categories" };
  const list = [allOption, ...options];
  const active = list.find((option) => option.id === value) ?? allOption;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex min-w-[160px] items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-card-hover"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Layers className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{active.name}</span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {list.map((option) => (
            <button
              key={option.id || "all-categories"}
              type="button"
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-card-hover",
                option.id === active.id && "bg-primary/10 text-primary"
              )}
            >
              <span className="truncate font-medium">{option.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterFallback({ width }: { width: string }) {
  return <div className={cn("h-9 animate-pulse rounded-xl bg-card", width)} />;
}

function CurrentSnapshotInfo({ accountLastSync }: { accountLastSync: string | null }) {
  return (
    <div className="text-right text-xs text-muted-foreground">
      <span className="block font-medium text-foreground/80">Current Snapshot</span>
      <span className="tabular-nums">
        {accountLastSync
          ? `Updated ${formatLastSyncTimestamp(accountLastSync)}`
          : "No inventory sync yet"}
      </span>
    </div>
  );
}

/**
 * Inventory scope filters — Company → Account → Brand → Category.
 * Company/Account/Brand reuse shared selectors (existing URL/query behaviour).
 * Category is client-side only over already-loaded models.
 * Date range is omitted: Inventory is current stock only (historical snapshots later).
 */
export function InventoryFilters({
  categoryOptions,
  categoryId,
  onCategoryChange,
  accountLastSync,
}: InventoryFiltersProps) {
  const sortedCategories = useMemo(
    () =>
      [...categoryOptions].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [categoryOptions]
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-3 py-3 sm:px-4"
      role="group"
      aria-label="Inventory filters"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Suspense fallback={<FilterFallback width="w-44" />}>
          <TenantSelectors />
        </Suspense>
        <Suspense fallback={<FilterFallback width="w-40" />}>
          <BrandSelector />
        </Suspense>
        <CategoryDropdown
          value={categoryId}
          options={sortedCategories}
          onSelect={onCategoryChange}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <CurrentSnapshotInfo accountLastSync={accountLastSync} />
        <Suspense fallback={<FilterFallback width="w-32" />}>
          <SyncButton />
        </Suspense>
      </div>
    </div>
  );
}
