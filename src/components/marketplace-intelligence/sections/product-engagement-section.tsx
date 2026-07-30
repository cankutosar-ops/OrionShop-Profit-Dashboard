"use client";

import type { ProductEngagementData } from "@/lib/reporting/sections/product-engagement";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";

export function ProductEngagementSection({
  section,
}: {
  section: ReportSection<ProductEngagementData>;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="product-engagement"
      title="Product Engagement Intelligence"
      description="Which products attract interest but fail to convert — requires Sales Funnel."
    >
      <ReportEmptyState
        variant="coming-soon"
        label={d.message}
        hint={d.explanation}
      />
    </ReportSectionFrame>
  );
}
