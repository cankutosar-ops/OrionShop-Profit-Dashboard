import Link from "next/link";
import type { ReportDefinition } from "@/lib/reporting/module/report-catalog";

type ReportPlaceholderProps = {
  report: ReportDefinition;
  hubHref?: string;
};

export function ReportPlaceholder({
  report,
  hubHref = "/reports",
}: ReportPlaceholderProps) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Coming soon
      </p>
      <h2 className="mt-2 text-xl font-semibold">{report.title}</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
        {report.description} This report will reuse the shared Reporting Module
        framework and Financial Engine — no duplicate calculations.
      </p>
      <Link
        href={hubHref}
        className="mt-6 inline-flex text-sm font-medium text-primary hover:underline"
      >
        Back to Reports
      </Link>
    </div>
  );
}
