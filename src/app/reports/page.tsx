import { Suspense } from "react";
import Link from "next/link";
import { ExportBusinessReportButton } from "@/components/reports/export-business-report-button";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";

type ReportRoadmapSection = {
  title: string;
  items: Array<{
    title: string;
    href?: string;
  }>;
};

const REPORT_ROADMAP: ReportRoadmapSection[] = [
  {
    title: "Business Reports",
    items: [{ title: "Business Report (Sprint 7.1 foundation)" }],
  },
  {
    title: "Financial Reports",
    items: [
      { title: "Product Profit Report", href: "/reports/product-profit" },
      { title: "Brand Performance Report" },
      { title: "Marketplace Fees Report" },
    ],
  },
  {
    title: "Sales Reports",
    items: [{ title: "Sales Performance Report" }],
  },
  {
    title: "Inventory Reports",
    items: [{ title: "Inventory Summary" }],
  },
];

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const hrefWithScope = (href: string) => (scopeQuery ? `${href}?${scopeQuery}` : href);

  return (
    <>
      <ReportsHeader
        title="Reports"
        description="Historical analysis workspace based on persisted marketplace data"
      />

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Sprint 7.1 — Report Engine</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Temporary export action to validate ReportPayload → Template → Excel
            using the current dashboard period and trusted overview KPIs.
          </p>
          <Suspense
            fallback={
              <p className="mt-4 text-sm text-muted-foreground">Loading export…</p>
            }
          >
            <ExportBusinessReportButton className="mt-4" />
          </Suspense>
        </section>

        {REPORT_ROADMAP.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <ul className="mt-3 space-y-2">
              {section.items.map((item) => (
                <li
                  key={item.title}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
                >
                  {item.href ? (
                    <Link
                      href={hrefWithScope(item.href)}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <span>{item.title}</span>
                  )}
                  {item.href ? (
                    <span className="text-xs font-medium uppercase tracking-wide text-success">
                      Available
                    </span>
                  ) : item.title.startsWith("Business Report") ? (
                    <span className="text-xs font-medium uppercase tracking-wide text-success">
                      Engine Ready
                    </span>
                  ) : (
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Coming Soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
