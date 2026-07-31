import { Suspense, type ReactNode } from "react";
import { ReportsHeader } from "@/components/reports/reports-header";
import { ReportNav } from "@/components/reporting/report-nav";
import { ReportFilterPanel } from "@/components/reporting/report-filter-panel";

type ReportShellProps = {
  title: string;
  description?: string;
  /** Category options for the shared filter panel (name = value). */
  categories?: { id: string; name: string }[];
  selectedCategory?: string;
  children: ReactNode;
};

/**
 * Shared reporting page chrome: header filters + module nav + body.
 */
export function ReportShell({
  title,
  description,
  categories = [],
  selectedCategory,
  children,
}: ReportShellProps) {
  return (
    <>
      <ReportsHeader title={title} description={description} />
      <div className="mb-6 space-y-4">
        <Suspense fallback={<div className="h-9 animate-pulse rounded-xl bg-card" />}>
          <ReportNav />
        </Suspense>
        <Suspense fallback={<div className="h-10 w-48 animate-pulse rounded-xl bg-card" />}>
          <ReportFilterPanel
            categories={categories}
            selectedCategory={selectedCategory}
          />
        </Suspense>
      </div>
      {children}
    </>
  );
}
