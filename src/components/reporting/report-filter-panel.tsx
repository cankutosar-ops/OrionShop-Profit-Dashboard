"use client";

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REPORT_FILTER_PARAMS } from "@/lib/reporting/module/report-filters";
import { cn } from "@/lib/utils";

type ReportFilterPanelProps = {
  categories: { id: string; name: string }[];
  selectedCategory?: string;
};

/**
 * Shared report-level filters beyond global tenant/brand/date (in ReportsHeader).
 * Category is report-scoped and preserved across reporting routes via URL.
 */
export function ReportFilterPanel({
  categories,
  selectedCategory,
}: ReportFilterPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: string }[] = [];
    for (const c of categories) {
      const label = c.name.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      list.push({ value: label, label });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [categories]);

  const onCategoryChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(REPORT_FILTER_PARAMS.category, value);
      else next.delete(REPORT_FILTER_PARAMS.category);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        pending && "opacity-70"
      )}
    >
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Category
      </label>
      <select
        className="h-10 min-w-[12rem] rounded-xl border border-border bg-card px-3 text-sm"
        value={selectedCategory ?? ""}
        onChange={(e) => onCategoryChange(e.target.value)}
        aria-label="Filter report by category"
      >
        <option value="">All categories</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
