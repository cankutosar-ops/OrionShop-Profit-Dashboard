"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { REPORTING_CATALOG } from "@/lib/reporting/module/report-catalog";
import { cn } from "@/lib/utils";
import { copyScopeQueryParams } from "@/lib/filter-params";
import { REPORT_FILTER_PARAMS } from "@/lib/reporting/module/report-filters";

export function ReportNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (base: string) => {
    const q = new URLSearchParams();
    copyScopeQueryParams(q, searchParams);
    const category = searchParams.get(REPORT_FILTER_PARAMS.category);
    if (category) q.set(REPORT_FILTER_PARAMS.category, category);
    const qs = q.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <nav
      aria-label="Reporting module"
      className="flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {REPORTING_CATALOG.map((report) => {
        const active =
          pathname === report.href || pathname.startsWith(`${report.href}/`);
        return (
          <Link
            key={report.id}
            href={hrefFor(report.href)}
            className={cn(
              "rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition-ui",
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
            )}
          >
            {report.title}
            {report.status === "placeholder" && (
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
