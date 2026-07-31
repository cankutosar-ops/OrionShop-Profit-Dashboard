import { GroupPerformanceReportPage } from "@/components/reporting/group-performance-report-page";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

export default async function CategoryPerformancePage({ searchParams }: PageProps) {
  return (
    <GroupPerformanceReportPage
      searchParams={searchParams}
      config={{
        reportId: "category-performance",
        dimension: "category",
        ignoreCategoryFilter: true,
        ignoreBrandFilter: false,
        description:
          "Category rollups from Financial Engine product rows — management profitability view",
      }}
    />
  );
}
