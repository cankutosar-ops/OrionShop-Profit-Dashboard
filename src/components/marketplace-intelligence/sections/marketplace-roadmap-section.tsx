"use client";

import type { MarketplaceRoadmapData } from "@/lib/reporting/sections/marketplace-roadmap";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";

export function MarketplaceRoadmapSection({
  section,
}: {
  section: ReportSection<MarketplaceRoadmapData>;
}) {
  return (
    <ReportSectionFrame
      sectionId="marketplace-roadmap"
      title="Coming Soon"
      description="Future Marketplace Intelligence modules — no fake metrics."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.data.modules.map((mod) => (
          <article
            key={mod.id}
            className="rounded-xl border border-border/70 bg-background/40 px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {mod.title}
              </h3>
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Coming Soon
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {mod.description}
            </p>
          </article>
        ))}
      </div>
    </ReportSectionFrame>
  );
}
