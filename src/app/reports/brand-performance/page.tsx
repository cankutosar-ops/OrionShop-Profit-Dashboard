import { GroupPerformanceReportPage } from "@/components/reporting/group-performance-report-page";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput & { category?: string }>;
};

export default async function BrandPerformancePage({ searchParams }: PageProps) {
  return (
    <GroupPerformanceReportPage
      searchParams={searchParams}
      config={{
        reportId: "brand-performance",
        dimension: "brand",
        ignoreCategoryFilter: false,
        ignoreBrandFilter: true,
        description:
          "Brand rollups from Financial Engine product rows — management profitability view",
      }}
    />
  );
}
